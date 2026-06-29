# Git Secure-AI — Backend

Small Node/TypeScript (Fastify) service for **GitHub App auth + live repository
listing** — roadmap step 1. It replaces the frontend's mock repo list with real
data from the repositories a user grants the app.

> Scope so far: auth, sessions, `/api/repos`. Scan orchestration and the AI fix
> loop (roadmap steps 3–4) come later.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/health` | Liveness + whether GitHub creds are present |
| GET | `/api/auth/github` | Start the GitHub user-authorization flow |
| GET | `/api/auth/github/callback` | OAuth + post-install callback (sets session) |
| GET | `/api/auth/me` | Current user, or `401` |
| POST | `/api/auth/logout` | Clear the session |
| GET | `/api/repos` | Live repos for the user's installation (`401` if unauthenticated) |

## Setup

```bash
npm install
cp .env.example .env          # then fill in the values below
npm run dev                   # http://localhost:8787  (tsx watch)
```

Without credentials the server still boots: `/api/health` works and the auth
routes return `503`. This lets the frontend run in mock mode against a live
backend.

## Registering the GitHub App

1. Go to **https://github.com/settings/apps/new** (or an org's Developer settings).
2. **Name**: e.g. `Git Secure-AI (dev)`. **Homepage**: `http://localhost:5173`.
3. **Callback URL**: `http://localhost:8787/api/auth/github/callback`
   - Tick **"Request user authorization (OAuth) during installation"**.
4. **Webhooks**: uncheck *Active* for now (scan-on-push is a later step).
5. **Repository permissions** (least privilege):
   - **Metadata**: Read-only (required, lists repos)
   - **Contents**: **Read & write** (clone to scan, and create the fix branch/commit)
   - **Pull requests**: Read & write (open fix PRs)

   > If you already created the app with **Contents: Read-only**, opening fix PRs
   > will fail with 403. Bump it to **Read & write** under *Permissions & events*,
   > save, then **approve the updated permissions** on your installation.
6. **Where can this app be installed?**: Any account (or just yours for dev).
7. Create the app, then:
   - Copy the **App ID** → `GITHUB_APP_ID`
   - Copy the **App slug** (from the app's public URL `/apps/<slug>`) → `GITHUB_APP_SLUG`
   - Copy the **Client ID** → `GITHUB_CLIENT_ID`
   - **Generate a client secret** → `GITHUB_CLIENT_SECRET`
   - **Generate a private key**, download the `.pem`, and point
     `GITHUB_APP_PRIVATE_KEY_PATH` at it (or inline it in `GITHUB_APP_PRIVATE_KEY`).
8. **Install** the app on your account and pick the repos to grant.

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Restart `npm run dev`; `/api/health` should now report `"githubConfigured": true`.

## Notes / limits (dev slice)

- **Sessions are in-memory** — they reset on restart. Move to Redis/DB before
  running more than one instance.
- **First installation only** — if a user has the app on multiple accounts, the
  first installation is used. Multi-installation selection comes later.
- Cookies are `SameSite=Lax`; frontend (`:5173`) and backend (`:8787`) are
  same-site on `localhost`, so the session cookie flows in dev. For split domains
  in production, switch to `SameSite=None; Secure`.
