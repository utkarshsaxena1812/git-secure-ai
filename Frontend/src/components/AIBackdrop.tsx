import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

const ORANGE = '255,122,24'
const BLUE = '47,128,255'

type Node = {
  x: number
  y: number
  vx: number
  vy: number
  hot: boolean // orange "vulnerability" node vs blue clean node
  r: number
  pulse: number
}

const GLYPHS = [
  { t: '</>', x: '12%', y: '30%', c: 'azure', s: 26, d: 0, dur: 10 },
  { t: '{ }', x: '82%', y: '24%', c: 'accent', s: 30, d: 1.4, dur: 11 },
  { t: 'CVE', x: '24%', y: '70%', c: 'accent', s: 18, d: 2.2, dur: 9 },
  { t: 'sk_•••', x: '70%', y: '66%', c: 'azure', s: 18, d: 0.6, dur: 12 },
  { t: '0x1f', x: '46%', y: '82%', c: 'azure', s: 18, d: 3, dur: 10 },
  { t: 'npm', x: '88%', y: '48%', c: 'accent', s: 18, d: 1.8, dur: 13 },
  { t: 'AI', x: '8%', y: '54%', c: 'accent', s: 22, d: 2.6, dur: 11 },
  { t: '· · ·', x: '58%', y: '18%', c: 'azure', s: 22, d: 0.9, dur: 9 },
]

export default function AIBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouse = useRef({ x: -9999, y: -9999 })
  const rafRef = useRef<number | null>(null)
  const nodesRef = useRef<Node[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const build = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(70, (w * h) / 26000))
      nodesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        hot: Math.random() < 0.22,
        r: 1.2 + Math.random() * 1.8,
        pulse: 0,
      }))
    }
    build()
    window.addEventListener('resize', build)

    const onMouse = (e: MouseEvent) => (mouse.current = { x: e.clientX, y: e.clientY })
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) mouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    window.addEventListener('mousemove', onMouse)
    window.addEventListener('touchmove', onTouch, { passive: true })

    let scan = -0.15 // scan sweep position, 0..1 of width
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const LINK = 132

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      const nodes = nodesRef.current

      // advance scan sweep
      if (!reduce) {
        scan += 0.0016
        if (scan > 1.2) scan = -0.15
      }
      const scanX = scan * w

      // links
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < LINK) {
            const hot = a.hot || b.hot
            const alpha = (1 - dist / LINK) * 0.18
            ctx.strokeStyle = `rgba(${hot ? ORANGE : BLUE},${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // nodes
      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx
          n.y += n.vy
          if (n.x < 0 || n.x > w) n.vx *= -1
          if (n.y < 0 || n.y > h) n.vy *= -1
        }

        // scan sweep pulse
        if (Math.abs(n.x - scanX) < 26) n.pulse = 1
        n.pulse *= 0.94

        // cursor link
        const mdx = n.x - mouse.current.x
        const mdy = n.y - mouse.current.y
        const md = Math.hypot(mdx, mdy)
        if (md < 170) {
          const a = (1 - md / 170) * 0.5
          ctx.strokeStyle = `rgba(${n.hot ? ORANGE : BLUE},${a})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(n.x, n.y)
          ctx.lineTo(mouse.current.x, mouse.current.y)
          ctx.stroke()
        }

        const base = n.hot ? ORANGE : BLUE
        const glow = Math.min(1, 0.45 + n.pulse + (md < 170 ? (1 - md / 170) * 0.5 : 0))
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r + n.pulse * 1.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${base},${glow})`
        ctx.shadowBlur = 8 + n.pulse * 10
        ctx.shadowColor = `rgba(${base},0.9)`
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // soft scan beam
      if (scanX > 0 && scanX < w) {
        const grad = ctx.createLinearGradient(scanX - 60, 0, scanX + 60, 0)
        grad.addColorStop(0, 'rgba(47,128,255,0)')
        grad.addColorStop(0.5, 'rgba(47,128,255,0.07)')
        grad.addColorStop(1, 'rgba(47,128,255,0)')
        ctx.fillStyle = grad
        ctx.fillRect(scanX - 60, 0, 120, h)
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', build)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('touchmove', onTouch)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#04060a' }}>
      {/* gradient orbs */}
      <div
        className="absolute -top-32 -left-24 w-[44rem] h-[44rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,122,24,0.16) 0%, rgba(255,122,24,0) 65%)', filter: 'blur(20px)' }}
      />
      <div
        className="absolute -bottom-40 -right-24 w-[46rem] h-[46rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(47,128,255,0.18) 0%, rgba(47,128,255,0) 65%)', filter: 'blur(20px)' }}
      />

      {/* node network */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* floating code glyphs */}
      {GLYPHS.map((g, i) => (
        <span
          key={i}
          className="glyph font-mono absolute select-none pointer-events-none"
          style={
            {
              left: g.x,
              top: g.y,
              fontSize: g.s,
              color: g.c === 'accent' ? 'rgba(255,122,24,0.9)' : 'rgba(47,128,255,0.9)',
              ['--glyph-delay' as string]: `${g.d}s`,
              ['--glyph-dur' as string]: `${g.dur}s`,
              ['--glyph-opacity' as string]: 0.5,
            } as CSSProperties
          }
        >
          {g.t}
        </span>
      ))}

      {/* legibility vignette behind the heading */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(80% 50% at 50% 28%, rgba(4,6,10,0.72) 0%, rgba(4,6,10,0) 70%)' }}
      />
    </div>
  )
}
