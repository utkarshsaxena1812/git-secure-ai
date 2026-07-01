# Deploying Git Secure-AI (Render)

This deploys the **backend API** (Node/Fastify) and the **frontend** (static Vite
build) to [Render](https://render.com) — no Docker required. The included
[`render.yaml`](render.yaml) Blueprint provisions both services.

## What you get

- `git-secure-ai-api.onrender.com` — the backend (GitHub App auth, scanning, fixes)
- `git-secure-ai-web.onrender.com` — the frontend (talks to the API in live mode)

## 1. Create the services (Blueprint)

1. Push this repo to GitHub (done).
2. In Render: **New → Blueprint**, connect the repo. Render reads `render.yaml`
   and shows two services. Click **Apply**.
3. The frontend build auto-receives the API URL (`VITE_API_URL`), and the backend
   auto-receives the frontend URL (`FRONTEND_URL`) — wired by the Blueprint.

> **Cost note:** the backend uses **SQLite on a persistent disk**, which needs a
> paid instance type (`starter`, ~\$7/mo). On the free tier the filesystem is
> ephemeral — your scan history/fixes reset on every deploy. To stay free,
> either accept that, or switch to a managed Postgres later (a one-line Prisma
> `provider` change).

## 2. Point the GitHub App at production

Your existing GitHub App's callback URL points at `localhost`. Either update it
or create a separate **production** app. In the app's settings
(`https://github.com/settings/apps/<slug>`):

- **Callback URL** → `https://git-secure-ai-api.onrender.com/api/auth/github/callback`
- Keep **"Request user authorization (OAuth) during installation"** ticked.
- **Homepage URL** → your frontend URL.
- Permissions unchanged: Metadata (read), Contents (read **& write**), Pull
  requests (read & write). Re-approve on your installation if you change them.

## 3. Set the backend secrets in Render

On the **git-secure-ai-api** service → **Environment**, add (from the GitHub App):

| Key | Value |
| --- | ----- |
| `GITHUB_APP_ID` | App ID |
| `GITHUB_APP_SLUG` | app slug |
| `GITHUB_CLIENT_ID` | Client ID |
| `GITHUB_CLIENT_SECRET` | a generated client secret |
| `GITHUB_APP_PRIVATE_KEY` | paste the **full `.pem` contents** (multi-line is fine) |

`SESSION_SECRET` is generated automatically; `DATABASE_URL`, `NODE_ENV`, and
`FRONTEND_URL` come from the Blueprint. Save → the service redeploys.

## 4. Verify

- `https://git-secure-ai-api.onrender.com/api/health` → `{"githubConfigured": true}`
- Open the frontend, click **Connect GitHub**, authorize → you land in the app
  with your live repos.

## Notes / limits

- **Sessions are in-memory** — a redeploy or the free tier's idle-spindown logs
  everyone out. Move to Redis/DB-backed sessions before this matters.
- **Cross-site cookies**: the backend sets `SameSite=None; Secure` in production
  (frontend and backend are different subdomains). If you host both under one
  domain, set `COOKIE_SAMESITE=lax`.
- **Scanners** (gitleaks, osv-scanner) are downloaded at build time by
  `npm run setup:scanners` — no binaries are committed.
- **Test validation / Docker sandbox** stay off in this setup (`ENABLE_TEST_VALIDATION`,
  `SANDBOX_MODE`); enabling them on a PaaS needs more resources/config.
