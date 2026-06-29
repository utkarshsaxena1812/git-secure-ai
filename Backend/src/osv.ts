import { basename, relative } from 'node:path'
import type { Finding, Severity } from './types.js'

// OSV-Scanner JSON report shape (only the fields we use).
export type OsvReport = { results?: OsvResult[] }
type OsvResult = { source?: { path?: string }; packages?: OsvPackage[] }
type OsvPackage = {
  package?: { name?: string; version?: string; ecosystem?: string }
  vulnerabilities?: OsvVuln[]
  groups?: { ids?: string[]; max_severity?: string }[]
}
export type OsvVuln = {
  id: string
  summary?: string
  aliases?: string[]
  database_specific?: { severity?: string }
  affected?: { ranges?: { type?: string; events?: { introduced?: string; fixed?: string }[] }[] }[]
}

type VulnInfo = { id: string; advisory: string; severity: Severity; fixed?: string }
type PkgGroup = { ecosystem: string; name: string; version: string; manifest: string; vulns: VulnInfo[] }

// One Finding per vulnerable package (not per CVE): you bump the package once to
// clear all its advisories. The fix target is the highest fixed version found.
export function normalizeOsv(report: OsvReport, repoDir: string): Finding[] {
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

export function pickCve(aliases?: string[]): string | undefined {
  return aliases?.find((a) => a.startsWith('CVE-'))
}

// Only ECOSYSTEM/SEMVER ranges give real version numbers; GIT ranges give commit
// hashes, which are useless as a bump target — skip them.
export function ecosystemFixedVersion(vuln: OsvVuln): string | undefined {
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
export function maxSeverity(sevs: Severity[]): Severity {
  return sevs.reduce<Severity>((m, s) => (SEV_ORDER[s] > SEV_ORDER[m] ? s : m), 'Low')
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)]
}

// Stable = purely numeric dotted (optionally a leading "v"). Anything with a
// suffix like -rc.1, a1, .beta, +build is treated as a prerelease and skipped.
export function isStableVersion(v: string): boolean {
  return /^v?\d+(\.\d+)*$/.test(v.trim())
}

export function highestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b))
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export function osvSeverity(vuln: OsvVuln, groups?: { ids?: string[]; max_severity?: string }[]): Severity {
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
