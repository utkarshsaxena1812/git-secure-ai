import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename, relative } from 'node:path'
import { promisify } from 'node:util'
import { config } from './config.js'
import { getInstallationToken, getInstallationRepo, type RepoCloneInfo } from './githubApp.js'
import type { Finding, Severity, ScanResult } from './types.js'

const exec = promisify(execFile)

const CLONE_TIMEOUT_MS = 180_000
const GITLEAKS_TIMEOUT_MS = 120_000
const OSV_TIMEOUT_MS = 180_000

export class ScanError extends Error {
  constructor(
    message: string,
    public code: 'scanner_missing' | 'repo_not_found' | 'clone_failed' | 'scan_failed',
  ) {
    super(message)
    this.name = 'ScanError'
  }
}

export type ClonedRepo = { workdir: string; repoDir: string; repo: RepoCloneInfo }

/** Clones a repo through the installation token into a temp dir. Caller cleans up `workdir`. */
export async function cloneInstallationRepo(
  installationId: number,
  repoId: string,
): Promise<ClonedRepo> {
  const repo = await getInstallationRepo(installationId, repoId)
  if (!repo) throw new ScanError('Repository not found in this installation.', 'repo_not_found')
  const token = await getInstallationToken(installationId)
  const workdir = await mkdtemp(join(tmpdir(), 'sai-scan-'))
  const repoDir = join(workdir, 'repo')
  await cloneRepo(repo.cloneUrl, token, repoDir)
  return { workdir, repoDir, repo }
}

/** Runs OSV-Scanner on an already-checked-out directory (used to re-validate fixes). */
export async function scanDirForDependencies(repoDir: string): Promise<Finding[]> {
  return runOsv(repoDir)
}

/** Clones a repo (installation token) and runs every available scanner over it. */
export async function scanRepo(installationId: number, repoId: string): Promise<ScanResult> {
  const started = Date.now()

  const haveGitleaks = await fileExists(config.gitleaksPath)
  const haveOsv = await fileExists(config.osvScannerPath)
  if (!haveGitleaks && !haveOsv) {
    throw new ScanError('No scanner binaries found in ./bin. Run the setup step.', 'scanner_missing')
  }

  const { workdir, repoDir, repo } = await cloneInstallationRepo(installationId, repoId)

  try {
    const findings: Finding[] = []
    const scanners: string[] = []
    let lastError: Error | null = null

    if (haveGitleaks) {
      try {
        const raw = await runGitleaks(repoDir)
        for (const g of raw) findings.push(normalizeSecret(g, repo.fullName))
        scanners.push('gitleaks')
      } catch (err) {
        lastError = err as Error
      }
    }

    if (haveOsv) {
      try {
        findings.push(...(await runOsv(repoDir)))
        scanners.push('osv-scanner')
      } catch (err) {
        lastError = err as Error
      }
    }

    // If no scanner managed to run, surface the failure.
    if (scanners.length === 0) {
      throw new ScanError(`All scanners failed: ${lastError?.message ?? 'unknown error'}`, 'scan_failed')
    }

    return {
      repoId,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      scanners,
      findings: dedupe(findings),
    }
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {})
  }
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false)
}

async function cloneRepo(cloneUrl: string, token: string, dest: string): Promise<void> {
  // Token via auth header so it never lands in the process list or git config.
  const authHeader = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`
  try {
    await exec(
      'git',
      ['-c', `http.extraheader=${authHeader}`, 'clone', '--quiet', '--no-tags', cloneUrl, dest],
      { timeout: CLONE_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 16 },
    )
  } catch (err) {
    throw new ScanError(`Failed to clone repository: ${(err as Error).message}`, 'clone_failed')
  }
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>()
  for (const f of findings) if (!seen.has(f.id)) seen.set(f.id, f)
  return [...seen.values()]
}

// ---- gitleaks (secrets) ----

type GitleaksFinding = {
  RuleID: string
  Description: string
  File: string
  StartLine: number
  Commit: string
  Fingerprint: string
}

async function runGitleaks(repoDir: string): Promise<GitleaksFinding[]> {
  const reportPath = join(repoDir, '..', 'gitleaks-report.json')
  try {
    await exec(
      config.gitleaksPath,
      ['git', repoDir, '--report-format', 'json', '--report-path', reportPath, '--redact', '--no-banner', '--exit-code', '0', '--log-level', 'error'],
      { timeout: GITLEAKS_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 64 },
    )
  } catch (err) {
    throw new ScanError(`gitleaks failed: ${(err as Error).message}`, 'scan_failed')
  }
  try {
    const parsed = JSON.parse(await readFile(reportPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeSecret(g: GitleaksFinding, repoFullName: string): Finding {
  const shortCommit = (g.Commit ?? '').slice(0, 7)
  const label = ruleLabel(g.RuleID)
  const where = `${g.File}:${g.StartLine}`
  return {
    id: g.Fingerprint || `${g.Commit}:${g.File}:${g.RuleID}:${g.StartLine}`,
    label,
    severity: 'Critical',
    category: 'Secret',
    ref: where,
    beginner: {
      what: `Gitleaks matched the “${label}” rule — a secret appears in ${g.File} at line ${g.StartLine}.`,
      why: `Anyone who can read ${repoFullName} — including its full git history — can use this secret. It was committed${shortCommit ? ` in ${shortCommit}` : ''}, so treat it as already leaked.`,
      fix: `Rotate or revoke this credential now, then move it to an environment variable or a secrets manager. Deleting the line does NOT make you safe — it stays in git history.`,
    },
    pro: {
      what: `gitleaks rule "${g.RuleID}" matched at ${where}${shortCommit ? ` (commit ${shortCommit})` : ''}.`,
      why: `Secret committed to VCS history — assume compromised; automated scrapers harvest these continuously.`,
      fix: `Revoke + rotate at the provider, source from process.env / a secrets manager, and purge history (git filter-repo / BFG) if policy requires.`,
    },
  }
}

// ---- osv-scanner (vulnerable dependencies) ----

type OsvReport = { results?: OsvResult[] }
type OsvResult = { source?: { path?: string }; packages?: OsvPackage[] }
type OsvPackage = {
  package?: { name?: string; version?: string; ecosystem?: string }
  vulnerabilities?: OsvVuln[]
  groups?: { ids?: string[]; max_severity?: string }[]
}
type OsvVuln = {
  id: string
  summary?: string
  aliases?: string[]
  database_specific?: { severity?: string }
  affected?: { ranges?: { type?: string; events?: { introduced?: string; fixed?: string }[] }[] }[]
}

async function runOsv(repoDir: string): Promise<Finding[]> {
  const reportPath = join(repoDir, '..', 'osv-report.json')
  let execErr: (Error & { code?: number }) | null = null
  try {
    await exec(
      config.osvScannerPath,
      ['scan', 'source', '-r', repoDir, '--format', 'json', '--output', reportPath],
      { timeout: OSV_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 64 },
    )
  } catch (err) {
    // Exit code 1 = vulnerabilities found (report still written) — not an error.
    execErr = err as Error & { code?: number }
  }
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as OsvReport
    return normalizeOsv(report, repoDir)
  } catch {
    // No report written and exit code wasn't "found" → a real failure (or no lockfiles).
    if (execErr && execErr.code !== 1) {
      throw new ScanError(`osv-scanner: ${execErr.message}`, 'scan_failed')
    }
    return []
  }
}

type VulnInfo = { id: string; advisory: string; severity: Severity; fixed?: string }
type PkgGroup = { ecosystem: string; name: string; version: string; manifest: string; vulns: VulnInfo[] }

// One Finding per vulnerable package (not per CVE): you bump the package once to
// clear all its advisories. The fix target is the highest fixed version found.
function normalizeOsv(report: OsvReport, repoDir: string): Finding[] {
  const groups = new Map<string, PkgGroup>()
  for (const result of report.results ?? []) {
    const rawPath = result.source?.path ?? ''
    const rel = rawPath ? relative(repoDir, rawPath).replace(/\\/g, '/') : ''
    const manifest = rel && !rel.startsWith('..') ? rel : basename(rawPath)
    for (const pkg of result.packages ?? []) {
      const name = pkg.package?.name ?? 'unknown'
      const version = pkg.package?.version ?? '?'
      const ecosystem = pkg.package?.ecosystem ?? ''
      const key = `${ecosystem}:${name}@${version}`
      let g = groups.get(key)
      if (!g) {
        g = { ecosystem, name, version, manifest, vulns: [] }
        groups.set(key, g)
      }
      for (const vuln of pkg.vulnerabilities ?? []) {
        g.vulns.push({
          id: vuln.id,
          advisory: pickCve(vuln.aliases) ?? vuln.id,
          severity: osvSeverity(vuln, pkg.groups),
          fixed: ecosystemFixedVersion(vuln),
        })
      }
    }
  }

  const out: Finding[] = []
  for (const g of groups.values()) {
    if (g.vulns.length === 0) continue
    const severity = maxSeverity(g.vulns.map((v) => v.severity))
    const advisories = unique(g.vulns.map((v) => v.advisory))
    // Bump to the smallest STABLE version that clears the highest-numbered fix —
    // never a prerelease/RC. The fix loop's re-scan still validates completeness.
    const fixedVersion = highestVersion(
      g.vulns.map((v) => v.fixed).filter((v): v is string => !!v && isStableVersion(v)),
    )
    const count = g.vulns.length
    const shown = advisories.slice(0, 3).join(', ') + (advisories.length > 3 ? `, +${advisories.length - 3} more` : '')
    const word = count === 1 ? 'vulnerability' : 'vulnerabilities'

    out.push({
      id: `${g.ecosystem}:${g.name}@${g.version}`,
      label: `${g.name} ${g.version}`,
      severity,
      category: 'Dependency',
      ref: `${g.name}@${g.version}`,
      beginner: {
        what: `${g.name} ${g.version} has ${count} known ${word} (${shown}).`,
        why: `These advisories are public, so automated tools scan the internet for apps still on this version and may exploit them.`,
        fix: fixedVersion
          ? `Update ${g.name} to ${fixedVersion} in ${g.manifest}. The fix is inside the library, so your own code usually doesn’t change — but run your app or tests to confirm the upgrade is compatible.`
          : `Update ${g.name} to a patched release listed in the advisories.`,
      },
      pro: {
        what: `${g.name}@${g.version} — ${count} advisor${count === 1 ? 'y' : 'ies'}: ${shown}.`,
        why: `Publicly indexed; exploitability depends on whether the vulnerable code paths are reached.`,
        fix: fixedVersion
          ? `Bump ${g.name} to ${fixedVersion} in ${g.manifest}; no call-site changes expected. Run the test suite to confirm compatibility.`
          : `Upgrade ${g.name} to a fixed release.`,
      },
      fix: fixedVersion
        ? { ecosystem: g.ecosystem, package: g.name, currentVersion: g.version, fixedVersion, manifest: g.manifest, advisory: advisories[0] }
        : undefined,
    })
  }
  return out
}

function pickCve(aliases?: string[]): string | undefined {
  return aliases?.find((a) => a.startsWith('CVE-'))
}

// Only ECOSYSTEM/SEMVER ranges give real version numbers; GIT ranges give commit
// hashes, which are useless as a bump target — skip them.
function ecosystemFixedVersion(vuln: OsvVuln): string | undefined {
  for (const aff of vuln.affected ?? []) {
    for (const range of aff.ranges ?? []) {
      if ((range.type ?? '').toUpperCase() === 'GIT') continue
      for (const ev of range.events ?? []) {
        if (ev.fixed) return ev.fixed
      }
    }
  }
  return undefined
}

const SEV_ORDER: Record<Severity, number> = { Critical: 3, High: 2, Medium: 1, Low: 0 }
function maxSeverity(sevs: Severity[]): Severity {
  return sevs.reduce<Severity>((m, s) => (SEV_ORDER[s] > SEV_ORDER[m] ? s : m), 'Low')
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)]
}

// Stable = purely numeric dotted (optionally a leading "v"). Anything with a
// suffix like -rc.1, a1, .beta, +build is treated as a prerelease and skipped.
function isStableVersion(v: string): boolean {
  return /^v?\d+(\.\d+)*$/.test(v.trim())
}

function highestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b))
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

function osvSeverity(vuln: OsvVuln, groups?: { ids?: string[]; max_severity?: string }[]): Severity {
  const label = (vuln.database_specific?.severity ?? '').toUpperCase()
  if (label.includes('CRIT')) return 'Critical'
  if (label.includes('HIGH')) return 'High'
  if (label.includes('MOD') || label.includes('MED')) return 'Medium'
  if (label.includes('LOW')) return 'Low'

  const cvss = Number(
    groups?.find((g) => g.ids?.includes(vuln.id))?.max_severity ?? groups?.[0]?.max_severity ?? NaN,
  )
  if (!Number.isNaN(cvss)) {
    if (cvss >= 9) return 'Critical'
    if (cvss >= 7) return 'High'
    if (cvss >= 4) return 'Medium'
    return 'Low'
  }
  return 'Medium'
}

// ---- shared ----

const RULE_LABELS: Record<string, string> = {
  'aws-access-token': 'AWS access key',
  'aws-secret-key': 'AWS secret key',
  'github-pat': 'GitHub personal access token',
  'github-fine-grained-pat': 'GitHub fine-grained token',
  'github-oauth': 'GitHub OAuth token',
  'gitlab-pat': 'GitLab personal access token',
  'gcp-api-key': 'Google Cloud API key',
  'google-api-key': 'Google API key',
  'slack-access-token': 'Slack token',
  'stripe-access-token': 'Stripe API key',
  'private-key': 'Private key',
  'generic-api-key': 'Hardcoded secret',
  'openai-api-key': 'OpenAI API key',
  jwt: 'JSON Web Token',
}

function ruleLabel(ruleId: string): string {
  return RULE_LABELS[ruleId] ?? prettyRule(ruleId)
}

function prettyRule(ruleId: string): string {
  return ruleId
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
