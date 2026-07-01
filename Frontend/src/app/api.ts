// Thin API client. When VITE_API_URL is set we talk to the real backend;
// otherwise we fall back to the mock library so the demo runs standalone.
import {
  REPOS as MOCK_REPOS,
  FINDINGS,
  SCAN_HISTORY,
  repoById,
  type Repo,
  type Finding,
} from './mockData'

// Accept a full URL, or a bare host (some hosts inject the hostname only → https).
const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')
const API_URL = rawApiUrl && !/^https?:\/\//.test(rawApiUrl) ? `https://${rawApiUrl}` : rawApiUrl
export const isLiveMode = API_URL !== ''

export type User = { login: string; name: string | null; avatarUrl: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? body.error ?? message
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

// Cache so the repo-detail page can resolve a repo by id without refetching the list.
let cachedRepos: Repo[] | null = null

export async function fetchRepos(force = false): Promise<Repo[]> {
  if (!isLiveMode) {
    cachedRepos = MOCK_REPOS
    return MOCK_REPOS
  }
  if (cachedRepos && !force) return cachedRepos
  const { repos } = await apiGet<{ repos: Repo[] }>('/api/repos')
  cachedRepos = repos
  return repos
}

export async function getRepoById(id: string): Promise<Repo | undefined> {
  const repos = await fetchRepos()
  return repos.find((r) => r.id === id)
}

export type ScanResult = {
  repoId: string
  scannedAt: string
  durationMs: number
  scanners: string[]
  findings: Finding[]
}

/**
 * Live mode: runs a real scan on the backend (gitleaks) and returns findings.
 * Mock mode: replays the repo's mock findings after a short delay.
 */
export async function scanRepo(repoId: string): Promise<ScanResult> {
  if (!isLiveMode) {
    await new Promise((r) => setTimeout(r, 1600))
    const repo = MOCK_REPOS.find((r) => r.id === repoId)
    const findings = (repo?.findingIds ?? []).map((id) => FINDINGS[id]).filter(Boolean)
    return { repoId, scannedAt: new Date().toISOString(), durationMs: 1600, scanners: ['mock'], findings }
  }
  const res = await fetch(`${API_URL}/api/repos/${repoId}/scan`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? body.error ?? message
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<ScanResult>
}

export async function fetchMe(): Promise<User | null> {
  if (!isLiveMode) {
    return { login: 'acme', name: 'Acme Corp', avatarUrl: '' }
  }
  try {
    const { user } = await apiGet<{ user: User }>('/api/auth/me')
    return user
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

/** Live mode: hand off to the GitHub OAuth flow. Mock mode: run the fallback (enter the app). */
export function connectGitHub(fallback: () => void): void {
  if (isLiveMode) {
    window.location.href = `${API_URL}/api/auth/github`
  } else {
    fallback()
  }
}

/** Findings from a repo's most recent scan (loads existing results on detail open). */
export async function getRepoFindings(
  repoId: string,
): Promise<{ findings: Finding[]; scannedAt: string | null }> {
  if (!isLiveMode) {
    const repo = MOCK_REPOS.find((r) => r.id === repoId)
    const findings = (repo?.findingIds ?? []).map((id) => FINDINGS[id]).filter(Boolean)
    return { findings, scannedAt: repo?.lastScan ?? null }
  }
  return apiGet<{ findings: Finding[]; scannedAt: string | null }>(`/api/repos/${repoId}/findings`)
}

export type ScanSummary = {
  id: string
  repoId: string
  repoName: string
  when: string
  durationSec: number
  scanners: string
  findingCount: number
  critical: number
  delta: number
  status: string
  trigger?: string
}

type ScanDto = {
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

/** Recent scans for the Scan history screen. */
export async function fetchScans(): Promise<ScanSummary[]> {
  if (!isLiveMode) {
    return SCAN_HISTORY.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      repoName: repoById(s.repoId)?.name ?? s.repoId,
      when: s.when,
      durationSec: s.durationSec,
      scanners: s.scanner,
      findingCount: s.findings,
      critical: s.critical,
      delta: s.delta,
      status: 'completed',
      trigger: s.trigger,
    }))
  }
  const { scans } = await apiGet<{ scans: ScanDto[] }>('/api/scans')
  return scans.map((s) => ({
    id: s.id,
    repoId: s.repoGithubId,
    repoName: s.repoFullName,
    when: relativeTime(s.scannedAt),
    durationSec: Math.max(1, Math.round(s.durationMs / 1000)),
    scanners: s.scanners.replace(/,/g, ' · '),
    findingCount: s.findingCount,
    critical: s.critical,
    delta: s.delta,
    status: s.status,
  }))
}

export type FixPlan = {
  kind: string
  title: string
  branch: string
  summary: string
  package: string
  manifest: string
  fromVersion: string
  toVersion: string
  advisory: string
  body: string
  validated: boolean
}

/** Live mode: ask the backend for the (deterministic) fix plan for a finding. */
export async function previewFix(repoId: string, fingerprint: string): Promise<FixPlan> {
  const res = await fetch(`${API_URL}/api/repos/${repoId}/fix-preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint }),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? body.error ?? message
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message)
  }
  const { plan } = (await res.json()) as { plan: FixPlan }
  return plan
}

export type FixResult = {
  prUrl: string
  prNumber: number
  package: string
  fromVersion: string
  toVersion: string
  advisory: string
  validated: boolean
  testStatus: 'passed' | 'failed' | 'no-tests' | 'skipped' | 'error'
  merged: boolean
  mergeNote?: string
}

/** Live mode: run the validated fix loop and open a PR. Throws ApiError on failure. */
export async function openFix(repoId: string, fingerprint: string, autoMerge = false): Promise<FixResult> {
  const res = await fetch(`${API_URL}/api/repos/${repoId}/fix`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, autoMerge }),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? body.error ?? message
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<FixResult>
}

export type FixRecord = {
  id: string
  repoId: string
  repoName: string
  package: string
  fromVersion: string
  toVersion: string
  advisory: string
  prUrl: string
  prNumber: number
  status: string
  when: string
}

type FixDto = {
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

/** Opened fix PRs for the Fixes screen. */
export async function fetchFixes(): Promise<FixRecord[]> {
  if (!isLiveMode) {
    return [
      {
        id: 'mock-fix-1',
        repoId: 'r1',
        repoName: 'acme/payments-api',
        package: 'lodash',
        fromVersion: '4.17.15',
        toVersion: '4.17.21',
        advisory: 'CVE-2021-23337',
        prUrl: '#',
        prNumber: 42,
        status: 'open',
        when: '2 hours ago',
      },
    ]
  }
  const { fixes } = await apiGet<{ fixes: FixDto[] }>('/api/fixes')
  return fixes.map((f) => ({
    id: f.id,
    repoId: f.repoGithubId,
    repoName: f.repoFullName,
    package: f.package,
    fromVersion: f.fromVersion,
    toVersion: f.toVersion,
    advisory: f.advisory,
    prUrl: f.prUrl,
    prNumber: f.prNumber,
    status: f.status,
    when: relativeTime(f.createdAt),
  }))
}

function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export async function signOut(): Promise<void> {
  if (!isLiveMode) return
  try {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
  } catch {
    /* best-effort */
  } finally {
    cachedRepos = null
  }
}
