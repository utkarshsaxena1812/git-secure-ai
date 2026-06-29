import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitPullRequest, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { fetchFixes, type FixRecord } from './api'

export default function Fixes() {
  const [fixes, setFixes] = useState<FixRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchFixes()
      .then((f) => active && setFixes(f))
      .catch((err) => active && setError(err?.message ?? 'Could not load fixes.'))
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-10">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-medium" style={{ letterSpacing: '-0.03em' }}>
          Fixes
        </h1>
        <p className="text-white/50 text-sm mt-1">
          Validated dependency-bump pull requests Git Secure-AI has opened for you.
        </p>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 text-center py-16">
          <AlertCircle className="w-6 h-6 text-danger" />
          <p className="text-white/70 text-sm">{error}</p>
        </div>
      ) : fixes === null ? (
        <div className="flex items-center justify-center gap-2 text-white/45 text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading fixes…
        </div>
      ) : fixes.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-12 text-center">
          <GitPullRequest className="w-8 h-8 mx-auto mb-3 text-white/40" />
          <p className="text-white/70 text-sm">No fixes yet</p>
          <p className="text-white/45 text-xs mt-1">
            Open a repository, scan it, and click “Fix now” on a dependency finding.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {fixes.map((f) => (
            <div
              key={f.id}
              className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <GitPullRequest className="w-4 h-4 text-azure shrink-0" />
                  <span className="font-mono text-white text-sm">
                    {f.package} {f.fromVersion} → {f.toVersion}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-white/45 border border-white/12 rounded-full px-2 py-0.5">
                    {f.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-white/45 flex-wrap">
                  <Link to={`/app/repos/${f.repoId}`} className="font-mono hover:text-white truncate">
                    {f.repoName}
                  </Link>
                  <span className="font-mono">{f.advisory}</span>
                  <span>PR #{f.prNumber}</span>
                  <span>{f.when}</span>
                </div>
              </div>
              {f.prUrl && f.prUrl !== '#' && (
                <a
                  href={f.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 self-start text-white text-sm font-medium px-3 py-2 rounded-full border border-white/15 hover:border-white/30 transition-colors shrink-0"
                >
                  Review
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
