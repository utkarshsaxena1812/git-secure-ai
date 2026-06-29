import { useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useScrollReveal } from '../useScrollReveal'

type Level = 'beginner' | 'pro'

type Finding = {
  id: string
  label: string
  severity: 'Critical' | 'High' | 'Medium'
  ref: string
  beginner: { what: string; why: string; fix: string }
  pro: { what: string; why: string; fix: string }
}

const FINDINGS: Finding[] = [
  {
    id: 'secret',
    label: 'Hardcoded secret',
    severity: 'Critical',
    ref: 'config.js:14',
    beginner: {
      what: 'An AWS access key is written directly into your code on line 14.',
      why: 'Anyone who can read this code — including anyone browsing your git history — can use this key to access your AWS account. Treat it as already leaked.',
      fix: 'First rotate the key (deleting the line alone does NOT make you safe — it still lives in git history). Then load it from an environment variable so it never touches your code again.',
    },
    pro: {
      what: 'Static AWS access key id + secret committed in plaintext (config.js:14).',
      why: 'Credential exposure in VCS history; assume compromised. Trivially harvested by automated scrapers.',
      fix: 'Revoke + rotate in IAM, then source from process.env / a secrets manager. History rewrite optional but recommended.',
    },
  },
  {
    id: 'sqli',
    label: 'SQL injection',
    severity: 'High',
    ref: 'routes/user.js:22',
    beginner: {
      what: 'User input is glued directly into a database query (CWE-89).',
      why: 'An attacker can send crafted input that changes what the query does — reading, modifying, or deleting data they should never touch.',
      fix: 'Use a parameterized query: the database treats the input as data, not as part of the command, so injection can’t happen.',
    },
    pro: {
      what: 'Unsanitized req.query.id concatenated into SQL (CWE-89).',
      why: 'Allows arbitrary query manipulation, data exfiltration, and potential auth bypass.',
      fix: 'Switch to parameterized statements / prepared queries with bound placeholders.',
    },
  },
  {
    id: 'dep',
    label: 'Vulnerable dependency',
    severity: 'Medium',
    ref: 'package.json',
    beginner: {
      what: 'Your project uses lodash 4.17.15, which has a known security bug (CVE-2021-23337).',
      why: 'Because the bug is public, automated tools scan the internet for apps still on the old version. Under the right conditions it allows command injection.',
      fix: 'Bump lodash to 4.17.21, the patched release. Your own code doesn’t change — the fix lives inside the library. We run your tests to confirm nothing breaks.',
    },
    pro: {
      what: 'lodash@4.17.15 — CVE-2021-23337 (command injection via template).',
      why: 'Known, publicly indexed CVE; exploitable depending on usage of vulnerable sink.',
      fix: 'Bump to 4.17.21. No call-site changes; validated against the existing test suite.',
    },
  },
]

const sevColor: Record<Finding['severity'], string> = {
  Critical: 'text-danger border-danger/40 bg-danger/10',
  High: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  Medium: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
}

export default function ExplanationEngine() {
  const [active, setActive] = useState(0)
  const [level, setLevel] = useState<Level>('beginner')
  const { ref, visible } = useScrollReveal<HTMLDivElement>()
  const finding = FINDINGS[active]
  const copy = finding[level]

  return (
    <section className="bg-gradient-to-b from-ink to-[#070c10] py-28 px-5 md:px-6">
      <div ref={ref} className={`max-w-container mx-auto reveal-on-scroll ${visible ? 'is-visible' : ''}`}>
        <p className="text-accent text-sm font-medium tracking-widest uppercase mb-4">The explanation engine</p>
        <h2 className="text-white text-3xl sm:text-5xl font-normal max-w-3xl leading-tight" style={{ letterSpacing: '-0.04em' }}>
          Not just a red list. Every finding <span className="font-playfair italic">teaches</span> you something.
        </h2>
        <p className="text-white/55 max-w-2xl mt-5 leading-relaxed">
          What it is, why it’s dangerous, and exactly what the fix changes — in language tuned to your level.
          Built for students and seniors alike.
        </p>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 mt-14">
          {/* finding list */}
          <div className="flex flex-col gap-2">
            {FINDINGS.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setActive(i)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  i === active
                    ? 'bg-white/[0.06] border-white/20'
                    : 'bg-transparent border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white text-sm font-medium">{f.label}</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${sevColor[f.severity]}`}>
                    {f.severity}
                  </span>
                </div>
                <span className="font-mono text-white/35 text-xs mt-1 block">{f.ref}</span>
              </button>
            ))}
          </div>

          {/* explanation card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 sm:p-9">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-7">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <span className="text-white font-medium">{finding.label}</span>
                <span className="font-mono text-white/35 text-xs">{finding.ref}</span>
              </div>
              {/* level toggle */}
              <div className="flex bg-white/5 border border-white/10 rounded-full p-1 text-sm">
                {(['beginner', 'pro'] as Level[]).map((lv) => (
                  <button
                    key={lv}
                    onClick={() => setLevel(lv)}
                    className={`px-4 py-1.5 rounded-full capitalize transition-colors ${
                      level === lv ? 'bg-white text-gray-900 font-medium' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>

            <dl className="space-y-6">
              <Block term="What it is" body={copy.what} />
              <Block term="Why it’s dangerous" body={copy.why} accent="danger" />
              <Block term="What the fix changes" body={copy.fix} accent="accent" />
            </dl>

            <div className="flex items-center gap-3 mt-8 pt-7 border-t border-white/10">
              <button className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-[#0a0f0c] text-sm font-semibold px-5 py-2.5 rounded-full transition-colors">
                <ShieldCheck className="w-4 h-4" />
                Fix now
              </button>
              <span className="text-white/40 text-xs">Opens a validated pull request</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Block({ term, body, accent }: { term: string; body: string; accent?: 'danger' | 'accent' }) {
  const dot = accent === 'danger' ? 'bg-danger' : accent === 'accent' ? 'bg-accent' : 'bg-white/40'
  return (
    <div>
      <dt className="flex items-center gap-2 text-white/50 text-xs font-medium uppercase tracking-widest mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {term}
      </dt>
      <dd className="text-white/85 leading-relaxed">{body}</dd>
    </div>
  )
}
