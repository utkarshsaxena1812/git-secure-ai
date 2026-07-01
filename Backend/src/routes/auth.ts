import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { config, githubConfigured } from '../config.js'
import {
  getAuthorizationUrl,
  getInstallUrl,
  exchangeCodeForToken,
  getUser,
  getUserInstallations,
} from '../githubApp.js'
import { upsertUserAndInstallation } from '../store.js'
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  sessionFromRequest,
  sessionIdFromRequest,
} from '../session.js'

const STATE_COOKIE = 'sai_oauth_state'

export async function authRoutes(app: FastifyInstance) {
  // Start the GitHub user-authorization web flow.
  app.get('/api/auth/github', async (_req, reply) => {
    if (!githubConfigured) {
      return reply.code(503).send({ error: 'github_not_configured', message: 'The backend has no GitHub App credentials yet. See Backend/README.md.' })
    }
    const state = randomBytes(16).toString('hex')
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      path: '/',
      signed: true,
      maxAge: 600,
    })
    return reply.redirect(getAuthorizationUrl(state))
  })

  // OAuth + post-install callback.
  app.get('/api/auth/github/callback', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>
    const { code, state, installation_id } = query

    // Verify the state we set at the start of the flow (CSRF protection).
    const rawState = req.cookies[STATE_COOKIE]
    const unsigned = rawState ? req.unsignCookie(rawState) : { valid: false, value: null }
    reply.clearCookie(STATE_COOKIE, { path: '/' })
    if (!code || !state || !unsigned.valid || unsigned.value !== state) {
      return reply.redirect(`${config.frontendUrl}/#/?auth=error`)
    }

    try {
      const userToken = await exchangeCodeForToken(code, state)
      const user = await getUser(userToken)

      // Prefer the installation GitHub just sent (post-install), else the user's first.
      const installations = await getUserInstallations(userToken)
      let chosen = installation_id
        ? installations.find((i) => i.id === Number(installation_id))
        : installations[0]
      if (!chosen && installation_id) {
        chosen = installations[0] ?? { id: Number(installation_id), accountLogin: user.login }
      }

      // Authenticated but the app isn't installed anywhere yet → send to install.
      if (!chosen) {
        return reply.redirect(getInstallUrl(state))
      }

      await upsertUserAndInstallation(user, chosen.id, chosen.accountLogin || user.login)

      const sessionId = createSession({ user, userToken, installationId: chosen.id })
      setSessionCookie(reply, sessionId)
      return reply.redirect(`${config.frontendUrl}/#/app`)
    } catch (err) {
      req.log.error({ err }, 'github oauth callback failed')
      return reply.redirect(`${config.frontendUrl}/#/?auth=error`)
    }
  })

  // Current user, or 401 if not signed in.
  app.get('/api/auth/me', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })
    return { user: session.user }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(sessionIdFromRequest(req))
    clearSessionCookie(reply)
    return { ok: true }
  })
}
