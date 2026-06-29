import { Github, ShieldCheck } from 'lucide-react'
import { useScrollReveal } from '../useScrollReveal'

export function FinalCTA({ onLaunch }: { onLaunch?: () => void }) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>()
  return (
    <section className="bg-ink py-32 px-5 md:px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(60% 60% at 50% 0%, rgba(63,185,80,0.12) 0%, rgba(63,185,80,0) 70%)' }}
      />
      <div
        ref={ref}
        className={`max-w-container mx-auto text-center relative reveal-on-scroll ${visible ? 'is-visible' : ''}`}
      >
        <h2
          className="text-white text-4xl sm:text-6xl font-normal leading-[1.02] mx-auto max-w-3xl"
          style={{ letterSpacing: '-0.05em' }}
        >
          See what <span className="font-playfair italic">hides</span> in your code.
        </h2>
        <p className="text-white/55 mt-6 max-w-xl mx-auto leading-relaxed">
          Connect a repository and get your first security report — with fixes you can read, trust, and merge.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <button onClick={onLaunch} className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-[#1a0d02] text-sm font-semibold px-7 py-3.5 rounded-full transition-all hover:scale-[1.03] active:scale-95 hover:shadow-lg hover:shadow-accent/30">
            <Github className="w-[18px] h-[18px]" />
            Connect GitHub
          </button>
          <button className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium px-6 py-3.5 rounded-full border border-white/15 hover:border-white/30 transition-colors">
            View a sample report
          </button>
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="bg-[#04060a] border-t border-white/5 py-12 px-5 md:px-6">
      <div className="max-w-container mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <span className="font-playfair italic text-white text-lg">SecureAI</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm text-white/45">
          <a href="#" className="hover:text-white transition-colors">Product</a>
          <a href="#" className="hover:text-white transition-colors">Docs</a>
          <a href="#" className="hover:text-white transition-colors">Pricing</a>
          <a href="#" className="hover:text-white transition-colors">Security</a>
          <a href="#" className="hover:text-white transition-colors">GitHub</a>
        </div>
        <p className="text-white/30 text-xs">© {new Date().getFullYear()} Git Secure-AI</p>
      </div>
    </footer>
  )
}
