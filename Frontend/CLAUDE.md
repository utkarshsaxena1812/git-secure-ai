# CLAUDE.md — Git Secure-AI

Standing context for working in this repo. Read this first, then the code.

## What this is

Git Secure-AI is a security tool that connects to a user's GitHub, finds
vulnerabilities, fixes them with AI, and — crucially — **explains every finding
in plain language** so users learn while they fix.

The project now has two parts under `SecureAI/`:

- **`Frontend/`** — React landing page + authenticated app. Runs standalone on
  **mock data** by default; switches to **live data** when pointed at the backend.
- **`Backend/`** — Node/TypeScript (Fastify) service: GitHub App auth, sessions,
  live repo listing, and real secret scanning (Gitleaks). See `Backend/README.md`.

**Live vs mock is controlled by one switch:** the frontend env var `VITE_API_URL`.
Unset → mock mode (everything simulated against `mockData.ts`). Set (e.g.
`http://localhost:8787`) → live mode (real OAuth, real repos, real scans).

## Product flow (the loop the whole product serves)

Connect GitHub → list repositories → pick one → scan → findings each with a
plain-language explanation → "Fix now" → fix lands on a new branch as a validated
pull request → user reviews and merges. Optionally automated via webhooks.

## Non-negotiable principles (do not violate these)

These are product/safety decisions, not preferences. Keep them true in any UI,
copy, or backend work:

1. **PR-first, always.** AI fixes go onto a new branch and open a pull request.
   Never overwrite and push to the user's main branch directly.
2. **Validate before showing a fix.** A fix is only surfaced after it's been
   re-scanned (vuln gone) AND the repo's tests pass.
3. **Secrets are not fixed by deletion.** A hardcoded secret is already
   compromised once committed. Flow is alert → rotate/revoke → move to
   env/secrets manager. **Implemented:** `FindingCard` gives `Secret` findings a
   "Start rotation" flow (rotate/revoke checklist), never a "fixed" PR.
4. **Orchestrate scanners, don't build them.** Detection wraps best-in-class
   open-source scanners (Gitleaks for secrets — done; Trivy/OSV-Scanner for
   dependencies — next; Semgrep/CodeQL later).
5. **Human-in-the-loop by default.** Full auto-merge is opt-in only, low-risk
   categories only (the Settings screen exposes the dependency-bump opt-in).
6. **MVP scope = secrets + vulnerable dependencies.** SAST code-logic rewriting
   is a later phase.

## The signature feature: the explanation engine

Every finding is explained with a fixed shape so it teaches rather than flags:
**What it is** · **Why it's dangerous** · **What the fix changes / how to make it
safe** · optional **Learn more** (OWASP/CWE). A **Beginner / Pro** toggle switches
register; the default register is set on the Settings screen.

Explanations are **grounded in scanner output**, not free-form. Live Gitleaks
findings are templated from the actual rule id, file:line, and commit (see
`normalize()` in `Backend/src/scan.ts`).

## Tech stack

- **Frontend:** React 18 · TypeScript (strict) · Vite · Tailwind · lucide-react ·
  **react-router-dom (HashRouter)**. Hash routing is intentional so the static /
  `build:single` output works with no server config.
- **Backend:** Node + TypeScript · Fastify · Octokit (`App` — GitHub App auth) ·
  zod (env validation) · signed-cookie sessions (in-memory store for now) ·
  Gitleaks binary in `Backend/bin/` for scanning.

## Design system

- **Palette (black + orange + blue):** background `ink` `#04060a`; accent
  (orange) `#ff7a18` / hover `#e96a0c`; `azure` (blue) `#2f80ff`; `danger`
  `#f85149`. Tokens in `tailwind.config.js`. Change them there, not inline.
- **Severity colors:** Critical `#f85149`, High `#ff8c42`, Medium `#f0b429`,
  Low `#8b98a5` (see `SEVERITY_META` in `Frontend/src/app/mockData.ts`).
- **Fonts:** Space Grotesk (display/body, italic accent via `.font-playfair`),
  JetBrains Mono (code refs, eyebrows, CVE ids). Loaded in `index.html`.
- **Quality floor:** responsive to mobile, visible focus, `prefers-reduced-motion`
  respected. Bold hero; calm, legible app screens.

## Current state / structure

```
Frontend/src/
  App.tsx                  HashRouter: "/" landing, "/app/*" app screens
  main.tsx  index.css  useScrollReveal.ts  vite-env.d.ts
  components/              ── marketing landing page (mock-content-complete) ──
    Landing  Nav  Hero  AIBackdrop  HowItWorks  ExplanationEngine  Coverage  Footer
  app/                     ── authenticated app ──
    api.ts                 backend client + mock fallback (VITE_API_URL switch)
    AppLayout.tsx          shell: sidebar + mobile bar + <Outlet/> (scroll reset)
    Sidebar.tsx            nav (active states) + live GitHub user + sign out
    Dashboard.tsx          repo list, summary stats, search (loads via api.fetchRepos)
    RepoRow.tsx            repo card; live mode → scan opens the detail page
    RepoDetail.tsx         /app/repos/:id — scan + findings + explanations + history
    ScanHistory.tsx        /app/scans — scan log (mock data)
    Settings.tsx           /app/settings — default register + auto-merge opt-in
    SettingsContext.tsx    app-wide settings (default Beginner/Pro, auto-merge)
    FindingCard.tsx        one finding: explanation + Fix-now / Start-rotation
    useSimulatedScan.ts    mock scan progress animation
    mockData.ts            mock repos + findings library + posture scoring + scan log

Backend/src/
  server.ts                Fastify app: CORS (credentialed), cookies, routes, health
  config.ts                zod-validated env; boots even without GitHub creds
  types.ts                 Repo / Finding / ScanResult (mirror the frontend shapes)
  githubApp.ts             Octokit App: OAuth web flow, installation tokens, repos
  session.ts               signed-cookie session id → in-memory store
  scan.ts                  clone (token via auth header) + Gitleaks + normalize
  routes/auth.ts           /api/auth/github · /callback · /me · /logout
  routes/repos.ts          GET /api/repos · POST /api/repos/:id/scan
  bin/gitleaks.exe         scanner binary (gitignored)
  .env                     local secrets (gitignored); see .env.example + README
```

App screen routes (HashRouter): `/app` (repos), `/app/repos/:id`, `/app/scans`,
`/app/settings`. "Fixes" is a sidebar placeholder until the AI fix loop ships.

## Conventions

- Edit files **in place**. Keep components small and single-purpose.
- After frontend changes run `npm run build` (strict type-check + build, must stay
  green). After backend changes run `npm run typecheck` in `Backend/`.
- The **mock fallback** in `api.ts` is load-bearing: every backend call has a mock
  path so the frontend runs standalone. Preserve it when adding endpoints.
- Reuse design tokens and existing components before inventing new ones.
- Plain-verb, sentence-case copy. Errors say what happened and how to fix it.
- Backend responses must match the frontend's `Repo` / `Finding` shapes (the
  duplicated types in `Backend/src/types.ts` are the first thing to extract into a
  shared package when it grows).

## Run / build

```bash
# Frontend (mock mode by default)
cd Frontend && npm install && npm run dev      # http://localhost:5173

# Backend (needs Backend/.env — see Backend/README.md to register the GitHub App)
cd Backend && npm install && npm run dev        # http://localhost:8787
#   GET /api/health → { githubConfigured: true } once creds are set

# Live mode: set Frontend/.env  →  VITE_API_URL=http://localhost:8787  then restart Vite
```

Both dev servers are registered in `SecureAI/.claude/launch.json`.

## Roadmap (status)

1. **Real GitHub App auth** — ✅ done. GitHub App OAuth, sessions, live repos.
2. **More app screens** — ✅ done. react-router, repo detail, scan history,
   settings. (Org-wide view still pending.)
3. **Backend scan orchestration** — 🟡 in progress. Gitleaks secret scanning is
   live (synchronous, clone-and-scan). Remaining: Trivy/OSV-Scanner for
   dependencies, normalize multiple scanners, async job queue, sandboxing.
4. **AI fix + validation loop** — ⬜ next major step. Generate fix on a branch,
   re-scan + run tests, confidence score, open PR with the explanation.
5. **Automation** — ⬜ webhooks (scan on push), scheduled scans, CI gate, opt-in
   auto-merge for dependency bumps.

Cross-cutting TODOs: **persist scan results** (a DB — findings are currently
in-page only), move sessions out of memory, and `git init` the project (it's
currently tracked under the user's home folder, not its own repo).

## Key decisions log

- **Black + orange/blue, Space Grotesk + JetBrains Mono** for an AI/code identity.
- **Hero shows AI/code graphics, not literal code** (`AIBackdrop`).
- **HashRouter, not BrowserRouter** — keeps the static / single-file build working
  with no server rewrite rules.
- **Frontend-first with a mock fallback** (`VITE_API_URL` switch) so the demo runs
  standalone and live mode is additive.
- **Backend = Node/TS + Fastify + Octokit GitHub App** — chosen to share the
  finding/repo schema with the frontend; Octokit handles app/installation/OAuth.
- **Gitleaks as a local binary** (`Backend/bin/`), synchronous clone-and-scan
  first; async workers/sandboxing deferred. Clone uses an auth header (token never
  in the process list / git config); secret values are redacted by Gitleaks.
- **In-memory sessions** for the dev slice (reset on restart) — swap for Redis/DB
  before multi-instance.
