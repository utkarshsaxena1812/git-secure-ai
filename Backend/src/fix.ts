import type { DependencyFix, Finding } from './types.js'

// Ecosystems whose manifest we can edit deterministically today.
const AUTO_FIXABLE_ECOSYSTEMS = new Set(['pypi', 'pip', 'npm'])

export function isAutoFixable(finding: Finding): boolean {
  return (
    finding.category === 'Dependency' &&
    !!finding.fix &&
    AUTO_FIXABLE_ECOSYSTEMS.has(finding.fix.ecosystem.toLowerCase())
  )
}

export function ecosystemOf(fix: DependencyFix): 'pip' | 'npm' | 'other' {
  const eco = fix.ecosystem.toLowerCase()
  if (eco === 'pypi' || eco === 'pip') return 'pip'
  if (eco === 'npm') return 'npm'
  return 'other'
}

const normalizeName = (s: string) => s.toLowerCase().replace(/[-_.]+/g, '-')

/**
 * Bumps a pip requirement to an exact pin. Returns new content, or null if the
 * package isn't directly listed (e.g. a transitive dep) — so we never open a
 * misleading PR.
 */
export function applyPipBump(content: string, pkg: string, fixedVersion: string): string | null {
  const target = normalizeName(pkg)
  let changed = false
  const lines = content.split(/\r?\n/).map((line) => {
    const hashIdx = line.indexOf('#')
    const code = hashIdx >= 0 ? line.slice(0, hashIdx) : line
    const comment = hashIdx >= 0 ? line.slice(hashIdx) : ''
    if (!code.trim()) return line

    const [reqPart, ...markerParts] = code.trim().split(';')
    const marker = markerParts.length ? ` ;${markerParts.join(';')}` : ''
    const m = reqPart.trim().match(/^([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*(.*)$/)
    if (!m || normalizeName(m[1]) !== target) return line

    changed = true
    const rewritten = `${m[1]}${m[2] ?? ''}==${fixedVersion}${marker}`
    return comment ? `${rewritten}  ${comment}` : rewritten
  })
  return changed ? lines.join('\n') : null
}

export type NpmEdit = { content: string; strategy: 'range' | 'override' }

const NPM_DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

/**
 * Edits package.json to fix an npm package. For a DIRECT dependency it bumps the
 * version range in place (clean one-line diff); for a transitive dependency it
 * adds an `overrides` entry. Pairs with a regenerated package-lock.json. Returns
 * null if package.json can't be parsed.
 */
export function editNpmPackageJson(packageJson: string, pkg: string, version: string): NpmEdit | null {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(packageJson)
  } catch {
    return null
  }
  const indent = detectIndent(packageJson)

  for (const field of NPM_DEP_FIELDS) {
    const deps = json[field] as Record<string, string> | undefined
    if (deps && typeof deps === 'object' && pkg in deps) {
      deps[pkg] = bumpNpmRange(deps[pkg], version)
      return { content: JSON.stringify(json, null, indent) + '\n', strategy: 'range' }
    }
  }

  // Transitive dependency → pin via overrides.
  json.overrides = { ...(json.overrides as Record<string, string> | undefined), [pkg]: version }
  return { content: JSON.stringify(json, null, indent) + '\n', strategy: 'override' }
}

// Bumps a version range, preserving the operator (^, ~, exact). Complex ranges
// (||, spaces, x/*, hyphen) collapse to a caret range on the fixed version.
function bumpNpmRange(existing: string, version: string): string {
  const trimmed = existing.trim()
  const core = trimmed.replace(/^(\^|~|>=|<=|>|<|=|v)+/i, '')
  if (/[\s|*-]/.test(core) || /\bx\b/i.test(core) || trimmed.includes('||')) return `^${version}`
  const op = trimmed.match(/^(\^|~|>=|=|>)/)?.[1] ?? '' // no operator → exact pin
  return `${op}${version}`
}

function detectIndent(content: string): number | string {
  const m = content.match(/\n([ \t]+)"/)
  if (!m) return 2
  return m[1][0] === '\t' ? '\t' : m[1].length
}

// Groundwork for the AI fix + validation loop (roadmap step 4).
//
// Dependency bumps are the safest first fixer: the patched version comes
// straight from the advisory, so the "fix" is deterministic — no LLM needed.
// This module produces the *plan*; actually editing the manifest/lockfile,
// re-scanning, running tests, and opening the validated PR is the next step
// (the PR primitive lives in githubApp.openPullRequest).

export type FixPlan = {
  kind: 'dependency-bump'
  title: string
  branch: string
  summary: string
  package: string
  manifest: string
  fromVersion: string
  toVersion: string
  advisory: string
  body: string
  /** Validated PRs (re-scan + tests green) are not produced yet — principle #2. */
  validated: false
}

export function planDependencyFix(finding: Finding): FixPlan | null {
  if (finding.category !== 'Dependency' || !finding.fix) return null
  const { package: pkg, currentVersion, fixedVersion, manifest, advisory } = finding.fix

  const safePkg = pkg.replace(/[^a-z0-9._-]/gi, '-')
  return {
    kind: 'dependency-bump',
    title: `chore(deps): bump ${pkg} to ${fixedVersion} (${advisory})`,
    branch: `secure-ai/bump-${safePkg}-${fixedVersion}`,
    summary: `Update ${pkg} from ${currentVersion} to ${fixedVersion} in ${manifest} to resolve ${advisory}.`,
    package: pkg,
    manifest,
    fromVersion: currentVersion,
    toVersion: fixedVersion,
    advisory,
    body: [
      `Resolves **${advisory}**.`,
      '',
      finding.pro.what,
      '',
      `**Change:** \`${pkg}\` ${currentVersion} → ${fixedVersion} in \`${manifest}\`.`,
      '',
      finding.beginner.fix,
    ].join('\n'),
    validated: false,
  }
}
