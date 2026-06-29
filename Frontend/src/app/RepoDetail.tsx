import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Lock,
  Globe,
  ScanLine,
  RotateCw,
  Loader2,
  ShieldCheck,
  Clock,
  AlertCircle,
} from 'lucide-react'
import {
  FINDINGS,
  SEVERITY_META,
  scoreColor,
  scansForRepo,
  type Repo,
  type Finding,
  type Severity,
} from './mockData'
import { getRepoById, getRepoFindings, scanRepo, isLiveMode } from './api'
import { useSettings, type Level } from './SettingsContext'
import FindingCard from './FindingCard'

export default function RepoDetail() {
  const { repoId } = useParams()
  // undefined = still loading, null = not found
  const [repo, setRepo] = useState<Repo | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    if (!repoId) {
      setRepo(null)
      return
    }
    getRepoById(repoId)
      .then((r) => active && setRepo(r ?? null))
      .catch(() => active && setRepo(null))
    return () => {
      active = false
    }
  }, [repoId])

  if (repo === undefined) {
    return (
      <main className="max-w-5xl mx-auto px-5 md:px-8 py-16 flex items-center justify-center gap-2 text-white/45 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading repository…
      </main>
    )
  }

  if (!repo) {
    return (
      <main className="max-w-5xl mx-auto px-5 md:px-8 py-16 text-center">
        <p className="text-white/60 mb-4">That repository doesn’t exist.</p>
        <Link to="/app" className="text-azure hover:underline text-sm">
          ← Back to repositories
        </Link>
      </main>
    )
  }

  // Keyed on repo.id so scan/level state resets when navigating between repos.
  return <RepoDetailView key={repo.id} repo={repo} />
}

type Phase = 'idle' | 'scanning' | 'scanned'

function RepoDetailView({ repo }: { repo: Repo }) {
  const { defaultLevel } = useSettings()
  const [level, setLevel] = useState<Level>(defaultLevel)
  const prRef = useRef(42)
  const allocatePr = () => prRef.current++

  // Mock repos arrive pre-scanned with findings; live repos start unscanned.
  const mockFindings = useMemo(
    () => (isLiveMode ? [] : repo.findingIds.map((id) => FINDINGS[id]).filter(Boolean)),
    [repo],
  )
  const startScanned = !isLiveMode && repo.initialStatus === 'scanned'

  const [findings, setFindings] = useState<Finding[]>(startScanned ? mockFindings : [])
  const [phase, setPhase] = useState<Phase>(startScanned ? 'scanned' : 'idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(isLiveMode)
  const [justScanned, setJustScanned] = useState(false)

  // Live mode: load the last persisted scan so results show without re-scanning.
  useEffect(() => {
    if (!isLiveMode) return
    let active = true
    getRepoFindings(repo.id)
      .then(({ findings: prev, scannedAt }) => {
        if (!active) return
        if (scannedAt) {
          setFindings(prev)
          setPhase('scanned')
        }
        setLoadingExisting(false)
      })
      .catch(() => active && setLoadingExisting(false))
    return () => {
      active = false
    }
  }, [repo.id])

  const startScan = async () => {
    setScanError(null)
    setPhase('scanning')
    try {
      const result = await scanRepo(repo.id)
      setFindings(result.findings)
      setPhase('scanned')
      setJustScanned(true)
    } catch (err) {
      setScanError((err as Error)?.message ?? 'The scan failed.')
      setPhase(startScanned ? 'scanned' : 'idle')
    }
  }

  const counts = findings.reduce<Record<Severity, number>>(
    (acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }),
    { Critical: 0, High: 0, Medium: 0, Low: 0 },
  )
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_META[f.severity].weight, 0))
  const Visibility = repo.visibility === 'private' ? Lock : Globe
  const scans = scansForRepo(repo.id)
  const lastScanLabel = justScanned ? 'just now' : repo.lastScan

  return (
    <main className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-10">
      <Link
        to="/app"
        className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Repositories
      </Link>

      {/* header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Visibility className="w-4 h-4 text-white/40 shrink-0" />
            <h1 className="font-mono text-white text-lg md:text-xl truncate">{repo.name}</h1>
            <span className="text-[10px] uppercase tracking-wider text-white/40 border border-white/12 rounded-full px-2 py-0.5">
              {repo.visibility}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-white/45">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: repo.langColor }} />
              {repo.language}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {lastScanLabel ? `Scanned ${lastScanLabel}` : 'Never scanned'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {phase === 'scanned' && findings.length > 0 && (
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tabular-nums" style={{ color: scoreColor(score) }}>
                {score}
                <span className="text-white/30 text-sm font-normal">/100</span>
              </p>
              <p className="text-white/40 text-xs">posture</p>
            </div>
          )}
          <button
            onClick={startScan}
            disabled={phase === 'scanning'}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-60 text-[#1a0d02] text-sm font-semibold px-4 py-2.5 rounded-full transition-colors"
          >
            {phase === 'scanning' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : phase === 'idle' ? (
              <ScanLine className="w-4 h-4" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            {phase === 'scanning' ? 'Scanning…' : phase === 'idle' ? 'Scan now' : 'Re-scan'}
          </button>
        </div>
      </div>

      {/* scanning progress (indeterminate — a real scan's duration is unknown) */}
      {phase === 'scanning' && (
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-white/70">
              {isLiveMode ? 'Cloning and scanning with Gitleaks…' : 'Running Gitleaks · Trivy · OSV-Scanner…'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full animate-pulse"
              style={{ background: 'linear-gradient(90deg,#2f80ff,#ff7a18)' }}
            />
          </div>
        </div>
      )}

      {/* scan error */}
      {scanError && phase !== 'scanning' && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/[0.06] px-5 py-4">
          <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-white/85 text-sm font-medium">Scan failed</p>
            <p className="text-white/55 text-sm mt-0.5">{scanError}</p>
          </div>
        </div>
      )}

      {/* findings */}
      {phase !== 'scanning' && (
        <section className="mb-10">
          {loadingExisting ? (
            <div className="flex items-center justify-center gap-2 text-white/45 text-sm py-12">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading last scan…
            </div>
          ) : phase === 'idle' && findings.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
              <ScanLine className="w-8 h-8 mx-auto mb-3 text-white/40" />
              <p className="text-white/80 font-medium">Not scanned yet</p>
              <p className="text-white/45 text-sm mt-1">
                Run a scan to check this repository for hardcoded secrets.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-white font-medium">
                    {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {(['Critical', 'High', 'Medium', 'Low'] as Severity[])
                      .filter((s) => counts[s] > 0)
                      .map((s) => (
                        <span
                          key={s}
                          className="text-[11px] font-mono px-2 py-0.5 rounded-full"
                          style={{ color: SEVERITY_META[s].color, background: SEVERITY_META[s].color + '14' }}
                        >
                          {counts[s]} {s.slice(0, 4)}
                        </span>
                      ))}
                  </div>
                </div>

                {findings.length > 0 && (
                  <div className="flex bg-white/5 border border-white/10 rounded-full p-1 text-xs shrink-0">
                    {(['beginner', 'pro'] as Level[]).map((lv) => (
                      <button
                        key={lv}
                        onClick={() => setLevel(lv)}
                        className={`px-3 py-1 rounded-full capitalize transition-colors ${
                          level === lv ? 'bg-white text-gray-900 font-medium' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {findings.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center">
                  <ShieldCheck className="w-8 h-8 mx-auto mb-3" style={{ color: scoreColor(100) }} />
                  <p className="text-white/80 font-medium">No secrets found</p>
                  <p className="text-white/45 text-sm mt-1">
                    Gitleaks scanned this repository’s history and found nothing.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {findings.map((f) => (
                    <FindingCard key={f.id} finding={f} level={level} allocatePr={allocatePr} repoId={repo.id} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* per-repo scan history (mock only) */}
      {scans.length > 0 && (
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3">Recent scans</h2>
          <ul className="rounded-2xl border border-white/8 bg-white/[0.02] divide-y divide-white/8">
            {scans.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="text-white/70 w-28 shrink-0">{s.when}</span>
                <span className="font-mono text-white/40 text-xs hidden sm:block flex-1 truncate">{s.scanner}</span>
                <span className="text-white/45 text-xs">{s.durationSec}s</span>
                <span className="text-white/55 text-xs ml-auto">
                  {s.findings} {s.findings === 1 ? 'finding' : 'findings'}
                </span>
                <DeltaBadge delta={s.delta} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-white/30 text-xs w-12 text-right">±0</span>
  const better = delta < 0
  return (
    <span
      className="text-xs font-mono w-12 text-right"
      style={{ color: better ? '#3fb950' : '#f85149' }}
    >
      {better ? '' : '+'}
      {delta}
    </span>
  )
}
