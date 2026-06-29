import { Github, ScanLine, BookOpen, GitPullRequest } from 'lucide-react'
import { useScrollReveal } from '../useScrollReveal'

const STEPS = [
  {
    icon: Github,
    title: 'Connect',
    body: 'Install the GitHub App with least-privilege, per-repo access. No password, no broad scopes — revoke any time.',
  },
  {
    icon: ScanLine,
    title: 'Scan',
    body: 'Best-in-class scanners run in sandboxed containers to surface exposed secrets and vulnerable dependencies.',
  },
  {
    icon: BookOpen,
    title: 'Understand',
    body: 'Each finding comes with a plain-language explanation: what it is, why it’s dangerous, and what the fix changes.',
  },
  {
    icon: GitPullRequest,
    title: 'Fix & ship',
    body: 'The fix lands on a new branch as a pull request — validated against your tests — never pushed straight to main.',
  },
]

export default function HowItWorks() {
  const { ref, visible } = useScrollReveal<HTMLDivElement>()
  return (
    <section className="bg-ink py-28 px-5 md:px-6">
      <div ref={ref} className={`max-w-container mx-auto reveal-on-scroll ${visible ? 'is-visible' : ''}`}>
        <p className="text-accent text-sm font-medium tracking-widest uppercase mb-4">How it works</p>
        <h2 className="text-white text-3xl sm:text-5xl font-normal max-w-2xl leading-tight" style={{ letterSpacing: '-0.04em' }}>
          From <span className="font-playfair italic">connection</span> to merged fix, in four steps.
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px mt-16 bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.title} className="bg-ink p-7 flex flex-col gap-4 group hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center justify-between">
                  <Icon className="w-7 h-7 text-accent" strokeWidth={1.5} />
                  <span className="font-mono text-white/25 text-sm">0{i + 1}</span>
                </div>
                <h3 className="text-white text-xl font-medium">{s.title}</h3>
                <p className="text-white/55 text-sm leading-relaxed">{s.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
