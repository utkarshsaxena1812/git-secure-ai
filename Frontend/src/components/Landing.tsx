import Nav from './Nav'
import Hero from './Hero'
import HowItWorks from './HowItWorks'
import ExplanationEngine from './ExplanationEngine'
import Coverage from './Coverage'
import { FinalCTA, Footer } from './Footer'

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="bg-ink tracking-[-0.02em]">
      <Nav onLaunch={onLaunch} />
      <Hero onLaunch={onLaunch} />
      <HowItWorks />
      <ExplanationEngine />
      <Coverage />
      <FinalCTA onLaunch={onLaunch} />
      <Footer />
    </div>
  )
}
