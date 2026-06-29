# Git Secure-AI

A security tool that connects to your GitHub, finds vulnerabilities, fixes them
with AI, and — crucially — **explains every finding in plain language** so you
learn while you fix.

It wraps best-in-class open-source scanners, validates every fix, and opens a
pull request for your review. It never pushes to your protected branches and
never claims a fix is done until it's been re-scanned.

## What it does

```
Connect GitHub → list repos → scan → findings (each explained) →
"Fix now" → validated pull request → you review & merge
```

- **Secret scanning** — [Gitleaks](https://github.com/gitleaks/gitleaks) over full git history; secrets get a **rotate/revoke** flow (a committed secret is already compromised — deletion alone is never treated as a fix).
- **Dependency scanning** — [OSV-Scanner](https://github.com/google/osv-scanner) for known CVEs, grouped per package with the safe version to bump to.
- **Validated fixes** — for pip and npm, the fixer bumps the dependency, **re-scans to confirm the advisory is gone**, optionally runs your test suite, and opens a PR with the explanation in the body.
- **Explanation engine** — every finding is explained as *what it is · why it's dangerous · what the fix changes*, with a **Beginner / Pro** toggle.

## Repository layout

| Path | Description |
| ---- | ----------- |
| [`Frontend/`](Frontend) | React + TypeScript + Vite + Tailwind. Landing page + authenticated app. Runs standalone on mock data, or live against the backend. |
| [`Backend/`](Backend) | Node + TypeScript (Fastify). GitHub App auth, sessions, scan orchestration, the validated fix loop, and persistence (Prisma + SQLite). |

## Quick start

```bash
# Frontend (mock mode — no backend needed)
cd Frontend && npm install && npm run dev      # http://localhost:5173

# Backend (needs a GitHub App — see Backend/README.md)
cd Backend && npm install && npm run dev        # http://localhost:8787

# Live mode: set Frontend/.env → VITE_API_URL=http://localhost:8787
```

Backend setup (registering the GitHub App, scanner binaries, env) is documented
in [`Backend/README.md`](Backend/README.md).

## Design principles

- **PR-first, always** — fixes land on a new branch as a pull request.
- **Validate before showing a fix** — a fix is surfaced only after a re-scan confirms the vulnerability is gone.
- **Secrets are rotated, not deleted** — never claim a hardcoded secret is "fixed" by removing the line.
- **Human-in-the-loop by default** — you review and merge.

## Status

Early but functional: live GitHub auth, real secret + dependency scanning, and a
validated fix → PR loop all work end to end. Not yet production-hardened — see the
roadmap in [`Frontend/CLAUDE.md`](Frontend/CLAUDE.md).

> ⚠️ This is a work in progress and not yet audited for production use.
