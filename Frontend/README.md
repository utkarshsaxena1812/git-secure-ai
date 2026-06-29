# Git Secure-AI — Frontend

Frontend for Git Secure-AI: a marketing landing page plus the authenticated app
(repository list, simulated scan, and a findings panel with plain-language
explanations). Runs entirely on mock data — no backend required yet.

## Stack
React 18 · TypeScript · Vite · Tailwind CSS · lucide-react

## Run
```bash
npm install
npm run dev      # http://localhost:5173
```
Click **Connect GitHub** (or **Sign up**) on the landing page to enter the app
(also reachable at `#app`). Inside: search repos, click **Scan now** to watch a
simulated scan, then **View findings** to read the explanations and try **Fix now**.

## Build
```bash
npm run build         # standard production build → dist/
npm run build:single  # single self-contained index.html (preview)
```

## Structure
```
src/
  main.tsx                 entry
  App.tsx                  hash routing: landing  <->  #app
  index.css                Tailwind layers + animations
  useScrollReveal.ts       IntersectionObserver reveal hook
  components/              ── marketing landing page ──
    Landing.tsx            page composition
    Nav.tsx                fixed nav, scroll-aware, mobile menu
    Hero.tsx               dark hero
    AIBackdrop.tsx         animated node network + scan sweep + glyphs (orange/blue)
    HowItWorks.tsx         four-step flow
    ExplanationEngine.tsx  interactive finding + Beginner/Pro explanation
    Coverage.tsx           what it scans
    Footer.tsx             final CTA + footer
  app/                     ── authenticated app (mock data) ──
    Dashboard.tsx          shell: sidebar + summary stats + repo list + search
    Sidebar.tsx            app nav + account
    RepoRow.tsx            repo card + simulated scan progress + findings summary
    FindingsPanel.tsx      slide-over: explanations, Beginner/Pro, Fix now -> PR
    mockData.ts            repositories + findings library + posture scoring
```

## Notes
- Routing is hash-based for now (landing <-> #app). Swap in react-router when the
  app grows more screens (scan history, settings, etc.).
- All "actions" (Scan now, Fix now, Connect GitHub) are simulated against mock
  data. Wire them to the GitHub App + backend per the build plan to make them real.
- Design tokens live in `tailwind.config.js` (accent = orange, azure = blue).
