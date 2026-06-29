import { ShieldCheck, GitBranch, Info } from 'lucide-react'
import { useSettings, type Level } from './SettingsContext'

export default function Settings() {
  const { defaultLevel, setDefaultLevel, autoMergeDependencies, setAutoMergeDependencies } = useSettings()

  return (
    <main className="max-w-3xl mx-auto px-5 md:px-8 py-8 md:py-10">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-medium" style={{ letterSpacing: '-0.03em' }}>
          Settings
        </h1>
        <p className="text-white/50 text-sm mt-1">Defaults for how findings are explained and how fixes ship.</p>
      </div>

      <div className="space-y-4">
        {/* default explanation level */}
        <Section
          icon={ShieldCheck}
          title="Default explanation style"
          desc="The register every finding opens in. You can still switch per repository."
        >
          <div className="flex bg-white/5 border border-white/10 rounded-full p-1 text-sm self-start">
            {(['beginner', 'pro'] as Level[]).map((lv) => (
              <button
                key={lv}
                onClick={() => setDefaultLevel(lv)}
                className={`px-4 py-1.5 rounded-full capitalize transition-colors ${
                  defaultLevel === lv ? 'bg-white text-gray-900 font-medium' : 'text-white/60 hover:text-white'
                }`}
              >
                {lv}
              </button>
            ))}
          </div>
          <p className="text-white/40 text-xs mt-3">
            {defaultLevel === 'beginner'
              ? 'Beginner: gentle, plain language with analogies — teaches as you fix.'
              : 'Pro: terse and assumes security knowledge — CWE/CVE, sinks, and diffs.'}
          </p>
        </Section>

        {/* auto-merge */}
        <Section
          icon={GitBranch}
          title="Auto-merge low-risk fixes"
          desc="Let validated dependency version bumps merge themselves on non-protected branches."
        >
          <Toggle
            on={autoMergeDependencies}
            onChange={setAutoMergeDependencies}
            label="Auto-merge dependency bumps"
          />
          <div className="flex items-start gap-2 mt-4 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
            <Info className="w-4 h-4 text-azure shrink-0 mt-0.5" />
            <p className="text-white/55 text-xs leading-relaxed">
              Only applies to dependency bumps that pass re-scan and your test suite. Secrets and code-logic
              fixes always open a pull request for review — and never push to a protected branch.
            </p>
          </div>
        </Section>
      </div>
    </main>
  )
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof ShieldCheck
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 md:p-6">
      <div className="flex items-start gap-3 mb-4">
        <Icon className="w-5 h-5 text-white/60 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-white font-medium">{title}</h2>
          <p className="text-white/45 text-sm mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-3 self-start"
    >
      <span
        className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            on ? 'translate-x-5' : ''
          }`}
        />
      </span>
      <span className="text-white/80 text-sm">{label}</span>
    </button>
  )
}
