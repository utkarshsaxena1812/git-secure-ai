import { Github } from 'lucide-react'
import AIBackdrop from './AIBackdrop'

export default function Hero({ onLaunch }: { onLaunch?: () => void }) {
  return (
    <section id="top" className="relative w-full overflow-hidden bg-ink" style={{ height: '100dvh' }}>
      {/* AI / code graphic backdrop (black, orange + blue) */}
      <div className="absolute inset-0 z-10 hero-zoom">
        <AIBackdrop />
      </div>

      {/* eyebrow */}
      <div
        className="absolute top-[18%] sm:top-[16%] left-0 right-0 z-50 flex justify-center px-5 pointer-events-none hero-anim hero-fade"
        style={{ animationDelay: '0.15s' }}
      >
        <span className="font-mono text-xs sm:text-sm tracking-[0.3em] uppercase text-azure/80 border border-azure/20 rounded-full px-4 py-1.5 bg-azure/5">
          AI-powered security scanning
        </span>
      </div>

      {/* heading */}
      <div className="absolute top-[26%] sm:top-[24%] left-0 right-0 z-50 flex flex-col items-center text-center px-5 pointer-events-none">
        <h1 className="text-white leading-[0.95]">
          <span
            className="block font-playfair italic font-light text-5xl sm:text-7xl md:text-8xl hero-anim hero-reveal"
            style={{ letterSpacing: '-0.04em', animationDelay: '0.25s' }}
          >
            Every line
          </span>
          <span
            className="block font-medium text-5xl sm:text-7xl md:text-8xl -mt-1 hero-anim hero-reveal"
            style={{ letterSpacing: '-0.06em', animationDelay: '0.42s' }}
          >
            hides a secret
          </span>
        </h1>
      </div>

      {/* bottom-left paragraph */}
      <div
        className="hidden sm:block absolute bottom-14 left-10 md:left-14 max-w-[280px] z-50 hero-anim hero-fade"
        style={{ animationDelay: '0.7s' }}
      >
        <p className="text-sm text-white/70 leading-relaxed">
          Every repository carries hidden risk — exposed secrets, vulnerable dependencies, and flaws
          layered into code long before they ever reach production.
        </p>
      </div>

      {/* bottom-right block */}
      <div
        className="absolute bottom-10 sm:bottom-24 left-5 right-5 sm:left-auto sm:right-10 md:right-14 max-w-full sm:max-w-[280px] z-50 flex flex-col items-start gap-4 sm:gap-5 hero-anim hero-fade"
        style={{ animationDelay: '0.85s' }}
      >
        <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
          Git Secure-AI scans your repos, explains each finding in plain language, and opens a pull
          request with the fix — so you ship secure code without slowing down.
        </p>
        <button onClick={onLaunch} className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-[#1a0d02] text-sm font-semibold px-7 py-3 rounded-full transition-all hover:scale-[1.03] active:scale-95 hover:shadow-lg hover:shadow-accent/40">
          <Github className="w-[18px] h-[18px]" />
          Connect GitHub
        </button>
      </div>
    </section>
  )
}
