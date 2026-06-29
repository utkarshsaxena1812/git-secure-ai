import { useNavigate } from 'react-router-dom'
import { Lock, Globe, ScanLine, RotateCw, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import {
  FINDINGS,
  SEVERITY_META,
  postureScore,
  scoreColor,
  type Repo,
  type Severity,
} from './mockData'
import { useSimulatedScan } from './useSimulatedScan'
import { isLiveMode } from './api'

export default function RepoRow({ repo }: { repo: Repo }) {
  const navigate = useNavigate()
  const { status, progress, startScan } = useSimulatedScan(repo.initialStatus)

  const openDetail = () => navigate(`/app/repos/${repo.id}`)
  // Live mode runs the real scan on the detail page; mock mode animates inline.
  const handleScan = isLiveMode ? openDetail : startScan

  // Live repos carry persisted severity counts; mock repos derive from findingIds.
  const isLive = repo.severityCounts !== undefined
  const counts: Record<Severity, number> = isLive
    ? { Critical: 0, High: 0, Medium: 0, Low: 0, ...repo.severityCounts }
    : repo.findingIds
        .map((id) => FINDINGS[id])
        .filter(Boolean)
        .reduce<Record<Severity, number>>(
          (acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }),
          { Critical: 0, High: 0, Medium: 0, Low: 0 },
        )
  const total = isLive ? repo.findingTotal ?? 0 : repo.findingIds.length
  const score = isLive
    ? Math.max(0, 100 - (['Critical', 'High', 'Medium', 'Low'] as Severity[]).reduce((s, sev) => s + counts[sev] * SEVERITY_META[sev].weight, 0))
    : postureScore(repo.findingIds)
  const Visibility = repo.visibility === 'private' ? Lock : Globe

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] hover:border-white/16 transition-colors p-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
        {/* identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <Visibility className="w-4 h-4 text-white/40 shrink-0" />
            <button onClick={openDetail} className="font-mono text-white text-[15px] truncate hover:text-accent transition-colors">
              {repo.name}
            </button>
            <span className="text-[10px] uppercase tracking-wider text-white/40 border border-white/12 rounded-full px-2 py-0.5">
              {repo.visibility}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-white/45">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: repo.langColor }} />
              {repo.language}
            </span>
            <span>{repo.lastScan ? `Scanned ${repo.lastScan}` : 'Never scanned'}</span>
          </div>
        </div>

        {/* status / actions */}
        <div className="lg:w-[420px] shrink-0">
          {status === 'unscanned' && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/45 text-sm">Not scanned yet</span>
              <button
                onClick={handleScan}
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-[#1a0d02] text-sm font-semibold px-4 py-2 rounded-full transition-colors"
              >
                <ScanLine className="w-4 h-4" />
                Scan now
              </button>
            </div>
          )}

          {status === 'scanning' && (
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="inline-flex items-center gap-2 text-white/70">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scanning…
                </span>
                <span className="font-mono text-white/45">{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress * 100}%`,
                    background: 'linear-gradient(90deg,#2f80ff,#ff7a18)',
                  }}
                />
              </div>
            </div>
          )}

          {status === 'scanned' && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {total === 0 ? (
                <span className="inline-flex items-center gap-2 text-sm" style={{ color: scoreColor(100) }}>
                  <ShieldCheck className="w-4 h-4" />
                  No issues found
                </span>
              ) : (
                <div className="flex items-center gap-3">
                  {/* posture score */}
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-sm font-semibold tabular-nums"
                      style={{ color: scoreColor(score) }}
                    >
                      {score}
                    </span>
                    <span className="text-white/35 text-xs">posture</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['Critical', 'High', 'Medium', 'Low'] as Severity[])
                      .filter((s) => counts[s] > 0)
                      .map((s) => (
                        <span
                          key={s}
                          className="text-[11px] font-mono px-2 py-0.5 rounded-full"
                          style={{
                            color: SEVERITY_META[s].color,
                            background: SEVERITY_META[s].color + '14',
                          }}
                        >
                          {counts[s]} {s.slice(0, 4)}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={handleScan}
                  className="inline-flex items-center gap-1.5 text-white/55 hover:text-white text-sm px-3 py-2 rounded-full hover:bg-white/5 transition-colors"
                  aria-label="Re-scan"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Re-scan
                </button>
                {total > 0 && (
                  <button
                    onClick={openDetail}
                    className="inline-flex items-center gap-1 text-white text-sm font-medium px-3 py-2 rounded-full border border-white/15 hover:border-white/30 transition-colors"
                  >
                    View findings
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
