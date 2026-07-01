import { readFile, writeFile, rm } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { config } from './config.js'
import { cloneInstallationRepo, scanDirForDependencies } from './scan.js'
import { openPullRequest, isBranchProtected, mergePullRequest, type FileChange } from './githubApp.js'
import { planDependencyFix, isAutoFixable, ecosystemOf, applyPipBump, editNpmPackageJson } from './fix.js'
import { recordFix } from './store.js'
import { runNpm } from './sandbox.js'
import type { DependencyFix, Finding } from './types.js'

const NPM_TIMEOUT_MS = 180_000
const INSTALL_TIMEOUT_MS = 300_000
const TEST_TIMEOUT_MS = 300_000

export type TestStatus = 'passed' | 'failed' | 'no-tests' | 'skipped' | 'error'

export class FixError extends Error {
  constructor(
    message: string,
    public code: 'no_fix' | 'unsupported' | 'apply_failed' | 'not_resolved' | 'tests_failed' | 'pr_failed',
  ) {
    super(message)
    this.name = 'FixError'
  }
}

export type FixOutcome = {
  prUrl: string
  prNumber: number
  package: string
  fromVersion: string
  toVersion: string
  advisory: string
  validated: boolean
  testStatus: TestStatus
  merged: boolean
  mergeNote?: string
}

/**
 * Validated fix loop for a dependency finding:
 *   clone → edit the manifest(s) → re-scan to confirm the advisory is gone
 *   (principle #2) → open a PR for review (principle #1).
 * Never edits the base branch; never opens a PR unless the re-scan is clean.
 */
export async function runDependencyFix(
  installationId: number,
  repoId: string,
  finding: Finding,
  autoMerge = false,
): Promise<FixOutcome> {
  if (finding.category !== 'Dependency' || !finding.fix) {
    throw new FixError('No automatic fix is available for this finding.', 'no_fix')
  }
  if (!isAutoFixable(finding)) {
    throw new FixError(`Automatic pull requests for ${finding.fix.ecosystem} dependencies aren’t supported yet.`, 'unsupported')
  }
  const plan = planDependencyFix(finding)
  if (!plan) throw new FixError('Could not plan a fix.', 'no_fix')
  const fix = finding.fix

  const { workdir, repoDir, repo } = await cloneInstallationRepo(installationId, repoId)
  try {
    // Apply the bump to disk (so the re-scan sees it) and collect the changed files.
    const eco = ecosystemOf(fix)
    const files = eco === 'pip' ? await applyPipFix(repoDir, fix) : await applyNpmFix(repoDir, fix)

    // Validate: re-scan and confirm THIS finding is gone.
    const after = await scanDirForDependencies(repoDir)
    if (after.some((f) => f.id === finding.id)) {
      throw new FixError('Re-scan still flags this package after the bump — not opening a PR.', 'not_resolved')
    }

    // Optionally run the repo's own tests; a definite failure blocks the PR.
    let testStatus: TestStatus = 'skipped'
    if (config.enableTestValidation) {
      const t = await runTests(repoDir, fix)
      testStatus = t.status
      if (t.status === 'failed') {
        throw new FixError(`The bump broke the repository's tests — not opening a PR. ${t.detail}`, 'tests_failed')
      }
    }

    let pr: { url: string; number: number; baseBranch: string }
    try {
      pr = await openPullRequest(installationId, repo.fullName, {
        branch: plan.branch,
        files,
        message: plan.title,
        title: plan.title,
        body: `${plan.body}\n\n${validationFooter(testStatus)}`,
      })
    } catch (err) {
      throw new FixError(`Failed to open the pull request: ${(err as Error).message}`, 'pr_failed')
    }

    // Opt-in auto-merge — dependency bumps only (this loop), never a protected
    // base branch (principle #5). Anything else is left open for human review.
    let merged = false
    let mergeNote: string | undefined
    if (autoMerge) {
      if (await isBranchProtected(installationId, repo.fullName, pr.baseBranch)) {
        mergeNote = `Base branch “${pr.baseBranch}” is protected — left open for review.`
      } else {
        const res = await mergePullRequest(installationId, repo.fullName, pr.number)
        merged = res.merged
        if (!merged) mergeNote = res.message ?? 'Auto-merge was blocked — left open for review.'
      }
    }

    await recordFix({
      installationId,
      repoGithubId: repoId,
      repoFullName: repo.fullName,
      fingerprint: finding.id,
      package: fix.package,
      fromVersion: fix.currentVersion,
      toVersion: fix.fixedVersion,
      advisory: fix.advisory,
      prUrl: pr.url,
      prNumber: pr.number,
      status: merged ? 'merged' : 'open',
    })

    return {
      prUrl: pr.url,
      prNumber: pr.number,
      package: fix.package,
      fromVersion: fix.currentVersion,
      toVersion: fix.fixedVersion,
      advisory: fix.advisory,
      validated: true,
      testStatus,
      merged,
      mergeNote,
    }
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {})
  }
}

// PR footer reflecting what was actually validated (re-scan is always done).
function validationFooter(test: TestStatus): string {
  const base = '— Opened by Git Secure-AI. A re-scan confirmed this bump resolves the advisory.'
  if (test === 'passed') return `${base} The repository's tests passed after the bump.`
  if (test === 'no-tests') return `${base} No test suite was found — review and let your CI validate before merging.`
  return `${base} Tests aren't run automatically — review and let your CI validate before merging.`
}

// ---- test validation (opt-in; runs untrusted project code) ----

async function runTests(repoDir: string, fix: DependencyFix): Promise<{ status: TestStatus; detail: string }> {
  const dirRel = dirname(fix.manifest) === '.' ? '' : dirname(fix.manifest)
  const dir = join(repoDir, dirRel)
  if (ecosystemOf(fix) === 'npm') return runNpmTests(dir)
  return { status: 'skipped', detail: `Test validation isn’t supported for ${fix.ecosystem} yet.` }
}

async function runNpmTests(dir: string): Promise<{ status: TestStatus; detail: string }> {
  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  } catch {
    return { status: 'error', detail: 'Could not read package.json.' }
  }
  const testScript = pkg.scripts?.test
  if (!testScript || /no test specified/i.test(testScript)) {
    return { status: 'no-tests', detail: 'No test script defined.' }
  }

  try {
    await runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, timeout: INSTALL_TIMEOUT_MS })
  } catch (err) {
    // Can't run tests if deps won't install — don't block the (re-scan-validated) fix.
    return { status: 'error', detail: `Dependency install failed: ${(err as Error).message.slice(0, 200)}` }
  }

  try {
    await runNpm(['test'], { cwd: dir, timeout: TEST_TIMEOUT_MS })
    return { status: 'passed', detail: 'npm test passed.' }
  } catch {
    return { status: 'failed', detail: 'npm test reported failures.' }
  }
}

async function applyPipFix(repoDir: string, fix: DependencyFix): Promise<FileChange[]> {
  const manifestPath = join(repoDir, fix.manifest)
  let original: string
  try {
    original = await readFile(manifestPath, 'utf8')
  } catch {
    throw new FixError(`Manifest ${fix.manifest} not found in the repository.`, 'apply_failed')
  }
  const updated = applyPipBump(original, fix.package, fix.fixedVersion)
  if (updated === original) {
    throw new FixError(`Couldn’t apply the bump for ${fix.package} in ${fix.manifest}.`, 'apply_failed')
  }
  await writeFile(manifestPath, updated, 'utf8')
  return [{ path: fix.manifest, content: updated }]
}

async function applyNpmFix(repoDir: string, fix: DependencyFix): Promise<FileChange[]> {
  // OSV reports the lockfile as the manifest; only package-lock.json is supported.
  if (basename(fix.manifest) !== 'package-lock.json') {
    throw new FixError('Automatic PRs currently support npm package-lock.json only (not yarn/pnpm).', 'unsupported')
  }
  const dirRel = dirname(fix.manifest) === '.' ? '' : dirname(fix.manifest)
  const pkgRel = dirRel ? `${dirRel}/package.json` : 'package.json'
  const pkgPath = join(repoDir, pkgRel)

  let original: string
  try {
    original = await readFile(pkgPath, 'utf8')
  } catch {
    throw new FixError(`package.json not found next to ${fix.manifest}.`, 'apply_failed')
  }
  const edit = editNpmPackageJson(original, fix.package, fix.fixedVersion)
  if (!edit) throw new FixError('Could not parse package.json to apply the fix.', 'apply_failed')
  await writeFile(pkgPath, edit.content, 'utf8')

  // Regenerate package-lock.json honoring the change (no install, no scripts).
  try {
    await runNpm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: join(repoDir, dirRel),
      timeout: NPM_TIMEOUT_MS,
    })
  } catch (err) {
    throw new FixError(`Couldn’t regenerate package-lock.json: ${(err as Error).message}`, 'apply_failed')
  }

  let newLock: string
  try {
    newLock = await readFile(join(repoDir, fix.manifest), 'utf8')
  } catch {
    throw new FixError('package-lock.json was not regenerated.', 'apply_failed')
  }
  return [
    { path: pkgRel, content: edit.content },
    { path: fix.manifest, content: newLock },
  ]
}
