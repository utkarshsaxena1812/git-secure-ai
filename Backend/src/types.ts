// Mirrors the frontend's `Repo` shape (Frontend/src/app/mockData.ts) so the live
// /api/repos response is a drop-in replacement for the mock list. When the schema
// grows, this is the first candidate to extract into a shared package.

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

export type SessionUser = {
  login: string
  name: string | null
  avatarUrl: string
}

// Mirrors the frontend's Finding shape (Frontend/src/app/mockData.ts) so scan
// results render through the existing FindingCard / explanation engine.
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export type Category = 'Secret' | 'Dependency' | 'Code'
export type Explanation = { what: string; why: string; fix: string }

// Structured fix data for Dependency findings — drives the (deterministic)
// version-bump fix planner. Absent for secrets / code findings.
export type DependencyFix = {
  ecosystem: string
  package: string
  currentVersion: string
  fixedVersion: string
  manifest: string
  advisory: string // CVE or GHSA id
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

export type ScanResult = {
  repoId: string
  scannedAt: string
  durationMs: number
  scanners: string[]
  findings: Finding[]
}

// GitHub's "linguist" colors for the languages we surface most. Default for the rest.
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Ruby: '#701516',
  Java: '#b07219',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  PHP: '#4F5D95',
  Rust: '#dea584',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
}

export function langColor(language: string | null): string {
  if (!language) return '#8b98a5'
  return LANG_COLORS[language] ?? '#8b98a5'
}
