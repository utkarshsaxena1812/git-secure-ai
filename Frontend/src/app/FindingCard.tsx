import { useState } from 'react'
import {
  ShieldCheck,
  GitPullRequest,
  Loader2,
  KeyRound,
  Package,
  Code2,
  ExternalLink,
  AlertCircle,
  Wrench,
} from 'lucide-react'
import { SEVERITY_META, type Finding, type Category } from './mockData'
import { useSettings, type Level } from './SettingsContext'
import { isLiveMode, previewFix, openFix, ApiError, type FixPlan, type FixResult } from './api'

const CATEGORY_ICON: Record<Category, typeof KeyRound> = {
  Secret: KeyRound,
  Dependency: Package,
  Code: Code2,
}

// Optional deeper-reading link per finding ("Learn more"). Live findings carry a
// CVE/GHSA advisory; the mock library uses these fixed ids.
const LEARN_MORE: Record<string, { label: string; href: string }> = {
  secret: { label: 'OWASP: Secrets management', href: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
  sqli: { label: 'CWE-89: SQL injection', href: 'https://cwe.mitre.org/data/definitions/89.html' },
  xss: { label: 'CWE-79: Cross-site scripting', href: 'https://cwe.mitre.org/data/definitions/79.html' },
  'cmd-injection': { label: 'CWE-77: Command injection', href: 'https://cwe.mitre.org/data/definitions/77.html' },
  'dep-lodash': { label: 'CVE-2021-23337', href: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337' },
  'dep-axios': { label: 'CVE-2020-28168', href: 'https://nvd.nist.gov/vuln/detail/CVE-2020-28168' },
}

type FixState = 'idle' | 'working' | 'pr' | 'pr-live' | 'rotate' | 'plan' | 'error'

type Props = {
  finding: Finding
  level: Level
  /** Hands out the next mock PR number (mock mode only). */
  allocatePr: () => number
  /** GitHub repo id — needed to request a live fix plan. */
  repoId?: string
}

export default function FindingCard({ finding, level, allocatePr, repoId }: Props) {
  const [state, setState] = useState<FixState>('idle')
  const [prNumber, setPrNumber] = useState<number | null>(null)
  const [plan, setPlan] = useState<FixPlan | null>(null)
  const [fixResult, setFixResult] = useState<FixResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const { autoMergeDependencies } = useSettings()

  const copy = finding[level]
  const sev = SEVERITY_META[finding.severity]
  const Icon = CATEGORY_ICON[finding.category]
  const isSecret = finding.category === 'Secret'
  // Live dependency findings with no stable fixed version can't be auto-bumped.
  const noAutoFix = isLiveMode && finding.category === 'Dependency' && !finding.fix
  const advisoryUrl =
    finding.fix?.advisory && finding.fix.advisory.startsWith('CVE-')
      ? `https://nvd.nist.gov/vuln/detail/${finding.fix.advisory}`
      : undefined
  const learn = advisoryUrl
    ? { label: finding.fix!.advisory, href: advisoryUrl }
    : LEARN_MORE[finding.id]

  const run = async () => {
    // Secrets are never "fixed" by a diff — rotate (principle #3).
    if (isSecret) {
      setState('working')
      setTimeout(() => setState('rotate'), 1600)
      return
    }
    // Live mode: run the real validated fix loop (clone → bump → re-scan → PR).
    if (isLiveMode) {
      setState('working')
      try {
        const result = await openFix(repoId ?? '', finding.id, autoMergeDependencies)
        setFixResult(result)
        setState('pr-live')
      } catch (err) {
        // Unsupported ecosystem (e.g. npm) → show the manual fix plan instead.
        if (err instanceof ApiError && err.status === 422) {
          try {
            setPlan(await previewFix(repoId ?? '', finding.id))
            setState('plan')
            return
          } catch {
            /* fall through to error */
          }
        }
        setErrorMsg((err as Error)?.message ?? 'Could not generate a fix.')
        setState('error')
      }
      return
    }
    // Mock mode: simulate the validated-PR demo.
    setState('working')
    setTimeout(() => {
      setPrNumber(allocatePr())
      setState('pr')
    }, 1600)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
        <Icon className="w-[18px] h-[18px] text-white/60" />
        <span className="text-white font-medium">{finding.label}</span>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{ color: sev.color, borderColor: sev.color + '66', background: sev.color + '14' }}
        >
          {finding.severity}
        </span>
        <span className="font-mono text-white/35 text-xs ml-auto">{finding.ref}</span>
      </div>

      <div className="px-5 py-5 space-y-4">
        <Block term="What it is" body={copy.what} />
        <Block term="Why it’s dangerous" body={copy.why} dot="#f85149" />
        <Block term={isSecret ? 'How to make it safe' : 'What the fix changes'} body={copy.fix} dot="#ff7a18" />
        {learn && (
          <a
            href={learn.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-azure/90 hover:text-azure text-xs font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Learn more — {learn.label}
          </a>
        )}
      </div>

      <div className="px-5 py-4 border-t border-white/8 flex items-center gap-3 flex-wrap">
        {state === 'idle' && noAutoFix && (
          <span className="inline-flex items-center gap-2 text-white/55 text-sm">
            <AlertCircle className="w-4 h-4 text-white/40" />
            No stable patched version yet — update manually per the advisory.
          </span>
        )}

        {state === 'idle' && !noAutoFix && (
          <>
            <button
              onClick={run}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-[#1a0d02] text-sm font-semibold px-4 py-2 rounded-full transition-colors"
            >
              {isSecret ? <KeyRound className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              {isSecret ? 'Start rotation' : 'Fix now'}
            </button>
            <span className="text-white/35 text-xs">
              {isSecret
                ? 'Rotate & revoke — exposure can’t be undone by deleting code'
                : 'Bumps the dependency and opens a validated pull request'}
            </span>
          </>
        )}

        {state === 'working' && (
          <span className="inline-flex items-center gap-2 text-white/70 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {isSecret
              ? 'Preparing rotation steps…'
              : isLiveMode
                ? 'Applying bump, re-scanning, opening pull request…'
                : 'Generating fix, validating against tests…'}
          </span>
        )}

        {state === 'pr' && (
          <span className="inline-flex items-center gap-2 text-azure text-sm font-medium">
            <GitPullRequest className="w-4 h-4" />
            Pull request #{prNumber} opened — validated, ready for review
          </span>
        )}

        {state === 'pr-live' && fixResult && (
          <div className="text-sm w-full">
            <p
              className="inline-flex items-center gap-2 font-medium"
              style={{ color: fixResult.merged ? '#3fb950' : '#2f80ff' }}
            >
              <GitPullRequest className="w-4 h-4" />
              Pull request #{fixResult.prNumber} {fixResult.merged ? 'merged' : 'opened'} —{' '}
              <span className="font-mono text-white">
                {fixResult.package} {fixResult.fromVersion} → {fixResult.toVersion}
              </span>
            </p>
            <p className="text-white/55 text-xs mt-1.5">
              Vulnerability confirmed resolved by re-scan.{' '}
              {fixResult.merged
                ? 'Auto-merged (you opted in for dependency bumps).'
                : fixResult.mergeNote
                  ? fixResult.mergeNote
                  : fixResult.testStatus === 'passed'
                    ? 'The repo’s tests passed after the bump.'
                    : 'Your CI runs the tests on the PR — review and merge.'}
            </p>
            <a
              href={fixResult.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-azure hover:underline text-xs font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {fixResult.merged ? 'View pull request' : 'Review pull request'}
            </a>
          </div>
        )}

        {state === 'plan' && plan && (
          <div className="text-sm w-full">
            <p className="inline-flex items-center gap-2 text-accent font-medium mb-2">
              <Wrench className="w-4 h-4" />
              Fix available —{' '}
              <span className="font-mono text-white">
                {plan.package} {plan.fromVersion} → {plan.toVersion}
              </span>
            </p>
            <p className="text-white/70">
              {plan.summary}
            </p>
            <p className="text-white/40 text-xs mt-2">
              Automatic pull requests for this ecosystem are coming soon — for now, make this change manually
              (e.g. on branch <span className="font-mono text-white/70">{plan.branch}</span>).
            </p>
          </div>
        )}

        {state === 'error' && (
          <span className="inline-flex items-center gap-2 text-white/70 text-sm">
            <AlertCircle className="w-4 h-4 text-danger" />
            {errorMsg}
          </span>
        )}

        {state === 'rotate' && (
          <div className="text-sm">
            <p className="inline-flex items-center gap-2 text-danger font-medium mb-2">
              <KeyRound className="w-4 h-4" />
              Rotation required — treat this key as already compromised
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-white/75">
              <li>Revoke &amp; rotate the key in your provider (e.g. AWS IAM) now.</li>
              <li>Store the new value in an environment variable or secrets manager.</li>
              <li>We’ll open a PR swapping the hardcoded value for that reference — after you’ve rotated.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

function Block({ term, body, dot }: { term: string; body: string; dot?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-white/45 text-[11px] font-medium uppercase tracking-widest mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot ?? 'rgba(255,255,255,0.4)' }} />
        {term}
      </dt>
      <dd className="text-white/85 text-sm leading-relaxed">{body}</dd>
    </div>
  )
}
