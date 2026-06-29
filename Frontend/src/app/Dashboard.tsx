import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Loader2, AlertCircle } from 'lucide-react'
import RepoRow from './RepoRow'
import { FINDINGS, postureScore, type Repo } from './mockData'
import { fetchRepos, ApiError } from './api'

export default function Dashboard() {
  const [query, setQuery] = useState('')
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    fetchRepos()
      .then((r) => active && setRepos(r))
      .catch((err) => {
        if (!active) return
        // Not signed in → bounce back to the landing page to connect.
        if (err instanceof ApiError && err.status === 401) {
          navigate('/')
          return
        }
        setLoadError(err?.message ?? 'Could not load repositories.')
      })
    return () => {
      active = false
    }
  }, [navigate])

  const stats = useMemo(() => {
    const list = repos ?? []
    const scanned = list.filter((r) => r.initialStatus === 'scanned')
    const openFindings = scanned.reduce((n, r) => n + r.findingIds.length, 0)
    const critical = scanned.reduce(
      (n, r) => n + r.findingIds.filter((id) => FINDINGS[id]?.severity === 'Critical').length,
      0,
    )
    const avg = scanned.length
      ? Math.round(scanned.reduce((n, r) => n + postureScore(r.findingIds), 0) / scanned.length)
      : 0
    return { connected: list.length, openFindings, critical, avg }
  }, [repos])

  const filtered = (repos ?? []).filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <main className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-10">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium" style={{ letterSpacing: '-0.03em' }}>
            Repositories
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Connected via the Git Secure-AI GitHub App · least-privilege access
          </p>
        </div>
        <button className="inline-flex items-center gap-2 self-start bg-white/8 hover:bg-white/12 border border-white/12 text-white text-sm font-medium px-4 py-2.5 rounded-full transition-colors">
          <Plus className="w-4 h-4" />
          Add repositories
        </button>
      </div>

      {/* summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Connected repos" value={stats.connected} />
        <Stat label="Open findings" value={stats.openFindings} accent="#ff7a18" />
        <Stat label="Critical" value={stats.critical} accent="#f85149" />
        <Stat label="Avg posture" value={stats.avg} accent="#2f80ff" suffix="/100" />
      </div>

      {/* search */}
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-white/35 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repositories…"
          className="w-full bg-white/[0.03] border border-white/10 rounded-full pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-white/25 transition-colors"
        />
      </div>

      {/* repo list */}
      {repos === null && !loadError ? (
        <div className="flex items-center justify-center gap-2 text-white/45 text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading repositories…
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 text-center py-16">
          <AlertCircle className="w-6 h-6 text-danger" />
          <p className="text-white/70 text-sm">{loadError}</p>
          <p className="text-white/40 text-xs">Check that the backend is running and the GitHub App is configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((repo) => (
            <RepoRow key={repo.id} repo={repo} />
          ))}
          {(repos?.length ?? 0) === 0 && (
            <p className="text-white/40 text-sm text-center py-12">
              No repositories yet. Grant the Git Secure-AI app access to some repos on GitHub.
            </p>
          )}
          {(repos?.length ?? 0) > 0 && filtered.length === 0 && (
            <p className="text-white/40 text-sm text-center py-12">No repositories match “{query}”.</p>
          )}
        </div>
      )}
    </main>
  )
}

function Stat({
  label,
  value,
  accent,
  suffix,
}: {
  label: string
  value: number
  accent?: string
  suffix?: string
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <p className="text-white/45 text-xs mb-2">{label}</p>
      <p className="text-2xl font-medium tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
        {suffix && <span className="text-white/30 text-sm font-normal ml-0.5">{suffix}</span>}
      </p>
    </div>
  )
}
