import { KeyRound, Package, GitBranch, Bell } from 'lucide-react'
import { useScrollReveal } from '../useScrollReveal'

const ITEMS = [
  {
    icon: KeyRound,
    title: 'Exposed secrets',
    body: 'API keys, tokens, and credentials committed to code or buried in history — caught, and guided to safe rotation.',
  },
  {
    icon: Package,
    title: 'Vulnerable dependencies',
    body: 'Known CVEs in your packages, matched to the patched version. Deterministic, testable, low-risk fixes.',
  },
  {
    icon: GitBranch,
    title: 'Pull-request first',
    body: 'Fixes arrive as reviewable PRs validated against your test suite. Your main branch is never touched directly.',
  },
  {
    icon: Bell,
    title: 'Automated watch',
    body: 'Scan on every push, on a schedule, or as a CI gate — so newly-disclosed CVEs surface the day they land.',
  },
]

export default function Coverage() {
  const { ref, visible } = useScrollReveal<HTMLDivElement>()
  return (
    <section className="bg-[#070c10] py-28 px-5 md:px-6">
      <div ref={ref} className={`max-w-container mx-auto reveal-on-scroll ${visible ? 'is-visible' : ''}`}>
        <p className="text-accent text-sm font-medium tracking-widest uppercase mb-4">Coverage</p>
        <h2 className="text-white text-3xl sm:text-5xl font-normal max-w-2xl leading-tight" style={{ letterSpacing: '-0.04em' }}>
          Start where the fixes are <span className="font-playfair italic">reliable</span>.
        </h2>
        <p className="text-white/55 max-w-2xl mt-5 leading-relaxed">
          The first release focuses on the two categories with clear, testable remediations — then grows into
          deeper code analysis once every fix you ship is one you can trust.
        </p>

        <div className="grid sm:grid-cols-2 gap-5 mt-14">
          {ITEMS.map((it) => {
            const Icon = it.icon
            return (
              <div
                key={it.title}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 flex gap-5 hover:border-white/20 transition-colors"
              >
                <div className="shrink-0 w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-white text-lg font-medium mb-2">{it.title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{it.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
