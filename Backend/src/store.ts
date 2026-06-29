import { prisma } from './db.js'
import type { GithubUser } from './githubApp.js'
import type { Finding, Severity, Category, ScanResult } from './types.js'

// ---- writes ----

/** Upserts the signed-in user and their installation so scans have an owner. */
export async function upsertUserAndInstallation(
  user: GithubUser,
  installationId: number,
  accountLogin: string,
): Promise<void> {
  const dbUser = await prisma.user.upsert({
    where: { githubLogin: user.login },
    update: { name: user.name, avatarUrl: user.avatarUrl },
    create: { githubLogin: user.login, name: user.name, avatarUrl: user.avatarUrl },
  })
  await prisma.installation.upsert({
    where: { id: String(installationId) },
    update: { accountLogin, userId: dbUser.id },
    create: { id: String(installationId), accountLogin, userId: dbUser.id },
  })
}

/** Persists a completed scan and its findings. */
export async function saveScanResult(
  installationId: number,
  repoFullName: string,
  result: ScanResult,
): Promise<void> {
  await prisma.scan.create({
    data: {
      installationId: String(installationId),
      repoGithubId: result.repoId,
      repoFullName,
      status: 'completed',
      scanners: result.scanners.join(','),
      durationMs: result.durationMs,
      findingCount: result.findings.length,
      findings: {
        create: result.findings.map((f) => ({
          fingerprint: f.id,
          label: f.label,
          severity: f.severity,
          category: f.category,
          ref: f.ref,
          beginner: JSON.stringify(f.beginner),
          pro: JSON.stringify(f.pro),
          fix: f.fix ? JSON.stringify(f.fix) : null,
        })),
      },
    },
  })
}

/** Records a failed scan attempt (so it shows in history). */
export async function recordScanFailure(
  installationId: number,
  repoGithubId: string,
  repoFullName: string,
  message: string,
): Promise<void> {
  await prisma.scan.create({
    data: {
      installationId: String(installationId),
      repoGithubId,
      repoFullName,
      status: 'failed',
      scanners: 'gitleaks',
      durationMs: 0,
      findingCount: 0,
      error: message.slice(0, 500),
    },
  })
}

/** Records an opened fix pull request. */
export async function recordFix(data: {
  installationId: number
  repoGithubId: string
  repoFullName: string
  fingerprint: string
  package: string
  fromVersion: string
  toVersion: string
  advisory: string
  prUrl: string
  prNumber: number
}): Promise<void> {
  await prisma.fix.create({
    data: {
      installationId: String(data.installationId),
      repoGithubId: data.repoGithubId,
      repoFullName: data.repoFullName,
      fingerprint: data.fingerprint,
      package: data.package,
      fromVersion: data.fromVersion,
      toVersion: data.toVersion,
      advisory: data.advisory,
      prUrl: data.prUrl,
      prNumber: data.prNumber,
      status: 'open',
    },
  })
}

export type FixDto = {
  id: string
  repoGithubId: string
  repoFullName: string
  package: string
  fromVersion: string
  toVersion: string
  advisory: string
  prUrl: string
  prNumber: number
  status: string
  createdAt: string
}

/** Recent fix pull requests opened for this installation, newest first. */
export async function listFixes(installationId: number): Promise<FixDto[]> {
  const fixes = await prisma.fix.findMany({
    where: { installationId: String(installationId) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return fixes.map((f) => ({
    id: f.id,
    repoGithubId: f.repoGithubId,
    repoFullName: f.repoFullName,
    package: f.package,
    fromVersion: f.fromVersion,
    toVersion: f.toVersion,
    advisory: f.advisory,
    prUrl: f.prUrl,
    prNumber: f.prNumber,
    status: f.status,
    createdAt: f.createdAt.toISOString(),
  }))
}

// ---- reads ----

type FindingRow = {
  fingerprint: string
  label: string
  severity: string
  category: string
  ref: string
  beginner: string
  pro: string
  fix: string | null
}

function toFinding(row: FindingRow): Finding {
  return {
    id: row.fingerprint,
    label: row.label,
    severity: row.severity as Severity,
    category: row.category as Category,
    ref: row.ref,
    beginner: JSON.parse(row.beginner),
    pro: JSON.parse(row.pro),
    fix: row.fix ? JSON.parse(row.fix) : undefined,
  }
}

/** Findings from the most recent completed scan of a repo (empty if never scanned). */
export async function getLatestFindings(
  installationId: number,
  repoGithubId: string,
): Promise<{ findings: Finding[]; scannedAt: string | null }> {
  const scan = await prisma.scan.findFirst({
    where: { installationId: String(installationId), repoGithubId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    include: { findings: true },
  })
  if (!scan) return { findings: [], scannedAt: null }
  return { findings: scan.findings.map(toFinding), scannedAt: scan.createdAt.toISOString() }
}

/** Looks up a single persisted finding by its scanner fingerprint. */
export async function getFinding(
  installationId: number,
  repoGithubId: string,
  fingerprint: string,
): Promise<Finding | null> {
  const f = await prisma.finding.findFirst({
    where: {
      fingerprint,
      scan: { installationId: String(installationId), repoGithubId, status: 'completed' },
    },
    orderBy: { createdAt: 'desc' },
  })
  return f ? toFinding(f) : null
}

export type RepoScanSummary = {
  lastScanAt: string
  findingCount: number
  counts: Partial<Record<Severity, number>>
}

/** Per-repo summary of the latest completed scan, keyed by GitHub repo id. */
export async function getScanSummaries(
  installationId: number,
): Promise<Record<string, RepoScanSummary>> {
  const scans = await prisma.scan.findMany({
    where: { installationId: String(installationId), status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: {
      repoGithubId: true,
      createdAt: true,
      findingCount: true,
      findings: { select: { severity: true } },
    },
  })
  const summaries: Record<string, RepoScanSummary> = {}
  for (const s of scans) {
    if (summaries[s.repoGithubId]) continue // first = most recent
    const counts: Partial<Record<Severity, number>> = {}
    for (const f of s.findings) {
      const sev = f.severity as Severity
      counts[sev] = (counts[sev] ?? 0) + 1
    }
    summaries[s.repoGithubId] = {
      lastScanAt: s.createdAt.toISOString(),
      findingCount: s.findingCount,
      counts,
    }
  }
  return summaries
}

export type ScanSummaryDto = {
  id: string
  repoGithubId: string
  repoFullName: string
  scannedAt: string
  durationMs: number
  scanners: string
  findingCount: number
  critical: number
  delta: number
  status: string
}

/** Recent scans across all repos, newest first, with finding-count deltas. */
export async function listRecentScans(
  installationId: number,
  limit = 50,
): Promise<ScanSummaryDto[]> {
  const scans = await prisma.scan.findMany({
    where: { installationId: String(installationId) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { findings: { select: { severity: true } } },
  })

  // Delta = change vs the previous (older) scan of the same repo.
  const ascending = [...scans].reverse()
  const prevCount = new Map<string, number>()
  const deltaById = new Map<string, number>()
  for (const s of ascending) {
    const prev = prevCount.get(s.repoGithubId)
    deltaById.set(s.id, prev === undefined ? 0 : s.findingCount - prev)
    prevCount.set(s.repoGithubId, s.findingCount)
  }

  return scans.map((s) => ({
    id: s.id,
    repoGithubId: s.repoGithubId,
    repoFullName: s.repoFullName,
    scannedAt: s.createdAt.toISOString(),
    durationMs: s.durationMs,
    scanners: s.scanners,
    findingCount: s.findingCount,
    critical: s.findings.filter((f) => f.severity === 'Critical').length,
    delta: deltaById.get(s.id) ?? 0,
    status: s.status,
  }))
}
