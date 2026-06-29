import { randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from './config.js'
import type { GithubUser } from './githubApp.js'

export const SESSION_COOKIE = 'sai_session'

export type Session = {
  user: GithubUser
  userToken: string
  installationId: number
}

/**
 * In-memory session store. Fine for the dev slice; sessions reset on restart.
 * Swap for Redis or a DB-backed store when the backend goes multi-instance.
 */
const store = new Map<string, Session>()

export function createSession(data: Session): string {
  const id = randomBytes(24).toString('hex')
  store.set(id, data)
  return id
}

export function getSession(id: string | undefined): Session | undefined {
  return id ? store.get(id) : undefined
}

export function destroySession(id: string | undefined): void {
  if (id) store.delete(id)
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProd,
  path: '/',
  signed: true,
  maxAge: 60 * 60 * 24 * 7, // 7 days
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions)
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Reads + verifies the signed session cookie and returns the live session, if any. */
export function sessionFromRequest(req: FastifyRequest): Session | undefined {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return undefined
  const unsigned = req.unsignCookie(raw)
  if (!unsigned.valid || !unsigned.value) return undefined
  return getSession(unsigned.value)
}

export function sessionIdFromRequest(req: FastifyRequest): string | undefined {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return undefined
  const unsigned = req.unsignCookie(raw)
  return unsigned.valid ? unsigned.value ?? undefined : undefined
}
