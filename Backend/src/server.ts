import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { config, githubConfigured } from './config.js'
import { authRoutes } from './routes/auth.js'
import { repoRoutes } from './routes/repos.js'

const app = Fastify({
  logger: {
    transport: config.isProd ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  },
})

await app.register(cors, {
  origin: config.frontendUrl,
  credentials: true,
})

await app.register(cookie, {
  secret: config.sessionSecret,
})

app.get('/api/health', async () => ({
  ok: true,
  githubConfigured,
  time: new Date().toISOString(),
}))

await app.register(authRoutes)
await app.register(repoRoutes)

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
  if (!githubConfigured) {
    app.log.warn('GitHub App not configured — auth routes return 503 until GITHUB_* vars are set (see Backend/README.md).')
  }
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
