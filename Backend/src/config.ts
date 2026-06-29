import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

/**
 * Loads and validates environment configuration once at boot. If GitHub App
 * credentials are missing the server still starts (health + clear 503s on auth
 * routes) so the frontend can run in mock mode against a reachable backend.
 */
const schema = z.object({
  PORT: z.coerce.number().default(8787),
  PUBLIC_URL: z.string().url().default('http://localhost:8787'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars').default('dev-insecure-session-secret-change-me'),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().optional(),

  // Paths to scanner binaries. Default to the ones we download into ./bin.
  GITLEAKS_PATH: z.string().optional(),
  OSV_SCANNER_PATH: z.string().optional(),

  // Run the repo's own test suite as part of fix validation. Off by default:
  // it installs deps and executes untrusted project code (sandbox in prod).
  ENABLE_TEST_VALIDATION: z.string().optional(),

  // Isolation for untrusted execution (npm install/test). 'docker' runs it in an
  // ephemeral container; 'none' runs on the host with a secret-stripped env.
  SANDBOX_MODE: z.enum(['docker', 'none']).default('none'),
  SANDBOX_IMAGE: z.string().default('node:20-alpine'),
})

const env = schema.parse(process.env)

function resolvePrivateKey(): string | undefined {
  if (env.GITHUB_APP_PRIVATE_KEY_PATH) {
    try {
      return readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf8')
    } catch {
      return undefined
    }
  }
  // Inline keys often arrive with literal "\n" — normalize to real newlines.
  return env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n')
}

const privateKey = resolvePrivateKey()

const exe = (name: string) => (process.platform === 'win32' ? `./bin/${name}.exe` : `./bin/${name}`)
const defaultGitleaks = exe('gitleaks')
const defaultOsv = exe('osv-scanner')

export const config = {
  port: env.PORT,
  publicUrl: env.PUBLIC_URL.replace(/\/$/, ''),
  frontendUrl: env.FRONTEND_URL.replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET,
  isProd: process.env.NODE_ENV === 'production',
  github: {
    appId: env.GITHUB_APP_ID,
    appSlug: env.GITHUB_APP_SLUG,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    privateKey,
  },
  gitleaksPath: env.GITLEAKS_PATH ?? defaultGitleaks,
  osvScannerPath: env.OSV_SCANNER_PATH ?? defaultOsv,
  enableTestValidation: env.ENABLE_TEST_VALIDATION === 'true',
  sandboxMode: env.SANDBOX_MODE,
  sandboxImage: env.SANDBOX_IMAGE,
}

/** True only when every credential needed for the OAuth + installation flow is present. */
export const githubConfigured = Boolean(
  config.github.appId &&
    config.github.clientId &&
    config.github.clientSecret &&
    config.github.privateKey,
)

export const oauthCallbackUrl = `${config.publicUrl}/api/auth/github/callback`
