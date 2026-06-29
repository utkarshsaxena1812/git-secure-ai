import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitCommitHorizontal, CalendarClock, MousePointerClick, Loader2, AlertCircle } from 'lucide-react'
import { fetchScans, type ScanSummary } from './api'

const TRIGGER_META: Record<string, { label: string; icon: typeof MousePointerClick }> = {
  manual: { label: 'Manual', icon: MousePointerClick },
  push: { label: 'On push', icon: GitCommitHorizontal },
  scheduled: { label: 'Scheduled', icon: CalendarClock },
}

function trigger(t?: string) {
  return TRIGGER_META[t ?? 'manual'] ?? TRIGGER_META.manual
}

export default function ScanHistory() {
  const [scans, setScans] = useState<ScanSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchScans()
      .then((s) => active && setScans(s))
      .catch((err) => active && setError(err?.message ?? 'Could not load scans.'))
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-10">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-medium" style={{ letterSpacing: '-0.03em' }}>
          Scan history
        </h1>
        <p className="text-white/50 text-sm mt-1">
          Every scan job across your connected repositories, newest first.
        </p>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 text-center py-16">
          <AlertCircle className="w-6 h-6 text-danger" />
          <p className="text-white/70 text-sm">{error}</p>
        </div>
      ) : scans === null ? (
        <div className="flex items-center justify-center gap-2 text-white/45 text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading scans…
        </div>
      ) : scans.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-white/70 text-sm">No scans yet</p>
          <p className="text-white/45 text-xs mt-1">Scan a repository to start building history.</p>
        </div>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden md:block rounded-2xl border border-white/8 bg-white/[0.02] overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-white/40 text-xs text-left border-b border-white/8">
                  <th className="font-medium px-5 py-3">Repository</th>
                  <th className="font-medium px-5 py-3">Trigger</th>
                  <th className="font-medium px-5 py-3">Scanners</th>
                  <th className="font-medium px-5 py-3 text-right">Duration</th>
                  <th className="font-medium px-5 py-3 text-right">Findings</th>
                  <th className="font-medium px-5 py-3 text-right">Change</th>
                  <th className="font-medium px-5 py-3 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {scans.map((s) => {
                  const trig = trigger(s.trigger)
                  const TrigIcon = trig.icon
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3">
                        <Link to={`/app/repos/${s.repoId}`} className="font-mono text-white/90 hover:text-white">
                          {s.repoName}
                        </Link>
                        {s.status === 'failed' && <span className="text-danger text-xs ml-2">failed</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-white/55 text-xs">
                          <TrigIcon className="w-3.5 h-3.5" />
                          {trig.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-white/45 text-xs">{s.scanners}</td>
                      <td className="px-5 py-3 text-right text-white/55 tabular-nums">{s.durationSec}s</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span className="text-white/80">{s.findingCount}</span>
                        {s.critical > 0 && <span className="text-danger text-xs ml-1.5">{s.critical} crit</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Delta delta={s.delta} />
                      </td>
                      <td className="px-5 py-3 text-right text-white/45 text-xs whitespace-nowrap">{s.when}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="md:hidden space-y-3">
            {scans.map((s) => {
              const trig = trigger(s.trigger)
              const TrigIcon = trig.icon
              return (
                <Link
                  key={s.id}
                  to={`/app/repos/${s.repoId}`}
                  className="block rounded-2xl border border-white/8 bg-white/[0.02] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-white/90 text-sm truncate">{s.repoName}</span>
                    <span className="text-white/40 text-xs whitespace-nowrap">{s.when}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                    <span className="inline-flex items-center gap-1.5">
                      <TrigIcon className="w-3.5 h-3.5" />
                      {trig.label}
                    </span>
                    <span>{s.durationSec}s</span>
                    <span>
                      {s.findingCount} {s.findingCount === 1 ? 'finding' : 'findings'}
                    </span>
                    <span className="ml-auto">
                      <Delta delta={s.delta} />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}

function Delta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-white/30 text-xs">±0</span>
  const better = delta < 0
  return (
    <span className="text-xs font-mono" style={{ color: better ? '#3fb950' : '#f85149' }}>
      {better ? '' : '+'}
      {delta} {better ? 'fixed' : 'new'}
    </span>
  )
}
