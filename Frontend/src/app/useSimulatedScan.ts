import { useEffect, useRef, useState } from 'react'
import type { RepoStatus } from './mockData'

/**
 * Drives the simulated scan progress used across the app (repo rows + detail).
 * Pure mock: animates a 0→1 progress bar over `durationMs`, then flips to
 * 'scanned'. Swap the body for a real polling/SSE call when the backend lands.
 */
export function useSimulatedScan(initialStatus: RepoStatus, durationMs = 2200) {
  const [status, setStatus] = useState<RepoStatus>(initialStatus)
  const [progress, setProgress] = useState(initialStatus === 'scanned' ? 1 : 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const startScan = () => {
    setStatus('scanning')
    setProgress(0)
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      setProgress(p)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setStatus('scanned')
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  return { status, progress, startScan }
}
