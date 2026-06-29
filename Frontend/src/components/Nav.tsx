import { useEffect, useState } from 'react'
import { ShieldCheck, Menu, X } from 'lucide-react'

const LINKS = ['Scan', 'Repositories', 'Fixes', 'Pricing', 'Docs']

export default function Nav({ onLaunch }: { onLaunch?: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 py-4 md:px-6 md:py-5 transition-colors duration-300 ${
        scrolled ? 'bg-ink/70 backdrop-blur-md border-b border-white/5' : 'bg-transparent'
      }`}
    >
      <a href="#top" className="flex items-center gap-2">
        <ShieldCheck className="w-[26px] h-[26px] text-accent" strokeWidth={2} />
        <span className="font-playfair italic text-white text-2xl">SecureAI</span>
      </a>

      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full p-2 items-center gap-1">
        {LINKS.map((l, i) => (
          <button
            key={l}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              i === 0 ? 'text-white' : 'text-white/75 hover:bg-white/15 hover:text-white'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <button onClick={onLaunch} className="hidden md:block bg-white text-gray-900 text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-100 transition-colors">
        Sign up
      </button>

      <button
        className="md:hidden p-2 text-white"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-ink/95 backdrop-blur-md border-b border-white/10 flex flex-col p-4 gap-1">
          {LINKS.map((l) => (
            <button
              key={l}
              className="text-left px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-white text-sm font-medium"
            >
              {l}
            </button>
          ))}
          <button onClick={onLaunch} className="mt-2 bg-white text-gray-900 text-sm font-semibold px-6 py-3 rounded-full">
            Sign up
          </button>
        </div>
      )}
    </nav>
  )
}
