import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { config } from './config.js'
import { getInstallationToken, getInstallationRepo, type RepoCloneInfo } from './githubApp.js'
import { normalizeOsv, type OsvReport } from './osv.js'
import type { Finding, ScanResult } from './types.js'

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
// Report parsing + Finding normalization lives in osv.ts (pure + unit-tested).

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

// ---- shared (gitleaks rule labels) ----

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
