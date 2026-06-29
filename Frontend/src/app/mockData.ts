// ---- Mock data for the authenticated app (no backend yet) ----

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export type Category = 'Secret' | 'Dependency' | 'Code'
export type Explanation = { what: string; why: string; fix: string }

export type DependencyFix = {
  ecosystem: string
  package: string
  currentVersion: string
  fixedVersion: string
  manifest: string
  advisory: string
}

export type Finding = {
  id: string
  label: string
  severity: Severity
  category: Category
  ref: string
  beginner: Explanation
  pro: Explanation
  fix?: DependencyFix
}

export type RepoStatus = 'unscanned' | 'scanning' | 'scanned'

export type Repo = {
  id: string
  name: string
  visibility: 'private' | 'public'
  language: string
  langColor: string
  lastScan: string | null
  findingIds: string[]
  initialStatus: RepoStatus
  // Set in live mode from persisted scans (mock repos use findingIds instead).
  severityCounts?: Partial<Record<Severity, number>>
  findingTotal?: number
}

export const SEVERITY_META: Record<Severity, { color: string; weight: number }> = {
  Critical: { color: '#f85149', weight: 25 },
  High: { color: '#ff8c42', weight: 12 },
  Medium: { color: '#f0b429', weight: 5 },
  Low: { color: '#8b98a5', weight: 1 },
}

export const FINDINGS: Record<string, Finding> = {
  secret: {
    id: 'secret',
    label: 'Hardcoded secret',
    severity: 'Critical',
    category: 'Secret',
    ref: 'config.js:14',
    beginner: {
      what: 'An AWS access key is written directly into your code on line 14.',
      why: 'Anyone who can read this code — including anyone browsing your git history — can use this key to access your AWS account. Treat it as already leaked.',
      fix: 'First rotate the key (deleting the line alone does NOT make you safe — it still lives in git history). Then load it from an environment variable so it never touches your code again.',
    },
    pro: {
      what: 'Static AWS access key id + secret committed in plaintext (config.js:14).',
      why: 'Credential exposure in VCS history; assume compromised. Trivially harvested by automated scrapers.',
      fix: 'Revoke + rotate in IAM, then source from process.env / a secrets manager. History rewrite recommended.',
    },
  },
  sqli: {
    id: 'sqli',
    label: 'SQL injection',
    severity: 'High',
    category: 'Code',
    ref: 'routes/user.js:22',
    beginner: {
      what: 'User input is glued directly into a database query (CWE-89).',
      why: 'An attacker can send crafted input that changes what the query does — reading, modifying, or deleting data they should never touch.',
      fix: 'Use a parameterized query so the database treats the input as data, not as part of the command.',
    },
    pro: {
      what: 'Unsanitized req.query.id concatenated into SQL (CWE-89).',
      why: 'Allows arbitrary query manipulation, data exfiltration, and potential auth bypass.',
      fix: 'Switch to parameterized statements with bound placeholders.',
    },
  },
  xss: {
    id: 'xss',
    label: 'Reflected XSS',
    severity: 'High',
    category: 'Code',
    ref: 'views/profile.js:8',
    beginner: {
      what: 'A value from the URL is written straight into the page’s HTML (CWE-79).',
      why: 'An attacker can craft a link that runs their JavaScript in your users’ browsers — stealing sessions or defacing the page.',
      fix: 'Escape the value before rendering it, so it’s shown as text instead of being treated as HTML.',
    },
    pro: {
      what: 'Unescaped req.query.name interpolated into response markup (CWE-79).',
      why: 'Reflected XSS — enables session theft, credential capture, and UI redress.',
      fix: 'Apply context-aware output encoding (escapeHtml) at the sink.',
    },
  },
  'dep-lodash': {
    id: 'dep-lodash',
    label: 'lodash 4.17.15',
    severity: 'Medium',
    category: 'Dependency',
    ref: 'package.json',
    beginner: {
      what: 'Your project uses lodash 4.17.15, which has a known security bug (CVE-2021-23337).',
      why: 'Because the bug is public, automated tools scan the internet for apps still on the old version. Under the right conditions it allows command injection.',
      fix: 'Bump lodash to 4.17.21, the patched release. Your own code doesn’t change — the fix lives inside the library. Tests are run to confirm nothing breaks.',
    },
    pro: {
      what: 'lodash@4.17.15 — CVE-2021-23337 (command injection via template).',
      why: 'Publicly indexed CVE; exploitable depending on usage of the vulnerable sink.',
      fix: 'Bump to 4.17.21. No call-site changes; validated against the test suite.',
    },
  },
  'dep-axios': {
    id: 'dep-axios',
    label: 'axios 0.21.0',
    severity: 'Medium',
    category: 'Dependency',
    ref: 'package.json',
    beginner: {
      what: 'Your project uses axios 0.21.0, which is vulnerable to a server-side request forgery bug (CVE-2020-28168).',
      why: 'A crafted redirect can make your server send requests to internal addresses it shouldn’t be able to reach.',
      fix: 'Bump axios to 0.21.1 or later. No code changes needed on your side; tests confirm nothing breaks.',
    },
    pro: {
      what: 'axios@0.21.0 — CVE-2020-28168 (SSRF via redirect).',
      why: 'Allows bypass of proxy restrictions to reach internal services.',
      fix: 'Upgrade to ≥0.21.1. Validated against the test suite.',
    },
  },
  'cmd-injection': {
    id: 'cmd-injection',
    label: 'Command injection',
    severity: 'Critical',
    category: 'Code',
    ref: 'utils/net.js:31',
    beginner: {
      what: 'User input is passed into a shell command (CWE-77).',
      why: 'An attacker can append their own commands and run anything on your server — read files, install malware, or take it over entirely.',
      fix: 'Use execFile with the input as a separate argument (no shell), and validate it first, so the input can never be interpreted as a command.',
    },
    pro: {
      what: 'req.query.host concatenated into exec() (CWE-77).',
      why: 'Arbitrary command execution on the host — full RCE.',
      fix: 'Switch to execFile with an args array + input validation; drop the shell.',
    },
  },
}

export const REPOS: Repo[] = [
  {
    id: 'r1',
    name: 'acme/payments-api',
    visibility: 'private',
    language: 'TypeScript',
    langColor: '#3178c6',
    lastScan: '2 hours ago',
    findingIds: ['secret', 'sqli', 'dep-lodash', 'cmd-injection'],
    initialStatus: 'scanned',
  },
  {
    id: 'r2',
    name: 'acme/web-dashboard',
    visibility: 'private',
    language: 'TypeScript',
    langColor: '#3178c6',
    lastScan: '1 day ago',
    findingIds: [],
    initialStatus: 'scanned',
  },
  {
    id: 'r3',
    name: 'acme/auth-service',
    visibility: 'private',
    language: 'Go',
    langColor: '#00ADD8',
    lastScan: '5 hours ago',
    findingIds: ['sqli', 'dep-axios'],
    initialStatus: 'scanned',
  },
  {
    id: 'r4',
    name: 'acme/mobile-app',
    visibility: 'public',
    language: 'TypeScript',
    langColor: '#3178c6',
    lastScan: '3 days ago',
    findingIds: ['xss'],
    initialStatus: 'scanned',
  },
  {
    id: 'r5',
    name: 'acme/marketing-site',
    visibility: 'public',
    language: 'JavaScript',
    langColor: '#f1e05a',
    lastScan: null,
    findingIds: [],
    initialStatus: 'unscanned',
  },
  {
    id: 'r6',
    name: 'acme/data-pipeline',
    visibility: 'private',
    language: 'Python',
    langColor: '#3572A5',
    lastScan: null,
    findingIds: ['dep-axios'],
    initialStatus: 'unscanned',
  },
]

export function repoById(id: string | undefined): Repo | undefined {
  return REPOS.find((r) => r.id === id)
}

// ---- Scan history (mock log of past scan jobs) ----

export type ScanTrigger = 'manual' | 'push' | 'scheduled'

export type ScanRecord = {
  id: string
  repoId: string
  when: string // human-friendly relative label
  durationSec: number
  scanner: string
  findings: number
  critical: number
  /** Change in open findings vs the previous scan (negative = fewer = better). */
  delta: number
  trigger: ScanTrigger
}

/** Newest first. References REPOS by id. */
export const SCAN_HISTORY: ScanRecord[] = [
  { id: 's1', repoId: 'r1', when: '2 hours ago', durationSec: 38, scanner: 'Gitleaks · Trivy · OSV', findings: 4, critical: 2, delta: 0, trigger: 'manual' },
  { id: 's2', repoId: 'r3', when: '5 hours ago', durationSec: 21, scanner: 'Gitleaks · OSV', findings: 2, critical: 0, delta: -1, trigger: 'push' },
  { id: 's3', repoId: 'r2', when: '1 day ago', durationSec: 17, scanner: 'Gitleaks · Trivy · OSV', findings: 0, critical: 0, delta: -3, trigger: 'scheduled' },
  { id: 's4', repoId: 'r1', when: '1 day ago', durationSec: 41, scanner: 'Gitleaks · Trivy · OSV', findings: 4, critical: 2, delta: 1, trigger: 'push' },
  { id: 's5', repoId: 'r4', when: '3 days ago', durationSec: 12, scanner: 'Semgrep · OSV', findings: 1, critical: 0, delta: 0, trigger: 'scheduled' },
  { id: 's6', repoId: 'r3', when: '4 days ago', durationSec: 23, scanner: 'Gitleaks · OSV', findings: 3, critical: 0, delta: 0, trigger: 'manual' },
]

export function scansForRepo(repoId: string): ScanRecord[] {
  return SCAN_HISTORY.filter((s) => s.repoId === repoId)
}

/** Posture score 0–100 derived from a repo's findings. */
export function postureScore(findingIds: string[]): number {
  const penalty = findingIds.reduce((sum, id) => {
    const f = FINDINGS[id]
    return f ? sum + SEVERITY_META[f.severity].weight : sum
  }, 0)
  return Math.max(0, 100 - penalty)
}

export function scoreColor(score: number): string {
  if (score >= 80) return '#2f80ff'
  if (score >= 50) return '#f0b429'
  return '#f85149'
}
