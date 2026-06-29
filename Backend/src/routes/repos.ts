import type { FastifyInstance } from 'fastify'
import { listInstallationRepos, getInstallationRepo } from '../githubApp.js'
import { sessionFromRequest } from '../session.js'
import { scanRepo, ScanError } from '../scan.js'
import {
  getScanSummaries,
  getLatestFindings,
  listRecentScans,
  saveScanResult,
  recordScanFailure,
  getFinding,
  listFixes,
} from '../store.js'
import { planDependencyFix } from '../fix.js'
import { runDependencyFix, FixError } from '../fixflow.js'
import { relativeTime } from '../util.js'

export async function repoRoutes(app: FastifyInstance) {
  // Live repositories, enriched with each repo's latest persisted scan.
  app.get('/api/repos', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })

    try {
      const [repos, summaries] = await Promise.all([
        listInstallationRepos(session.installationId),
        getScanSummaries(session.installationId),
      ])
      const enriched = repos.map((r) => {
        const s = summaries[r.id]
        if (!s) return r
        return {
          ...r,
          initialStatus: 'scanned' as const,
          lastScan: relativeTime(s.lastScanAt),
          severityCounts: s.counts,
          findingTotal: s.findingCount,
        }
      })
      return { repos: enriched }
    } catch (err) {
      req.log.error({ err }, 'failed to list installation repos')
      return reply.code(502).send({ error: 'github_error', message: 'Could not reach GitHub to list repositories.' })
    }
  })

  // Findings from the repo's most recent completed scan (empty if never scanned).
  app.get('/api/repos/:id/findings', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })
    const { id } = req.params as { id: string }
    const { findings, scannedAt } = await getLatestFindings(session.installationId, id)
    return { findings, scannedAt }
  })

  // Run a real scan (gitleaks), persist the result, and return normalized findings.
  app.post('/api/repos/:id/scan', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })

    const { id } = req.params as { id: string }
    try {
      const result = await scanRepo(session.installationId, id)
      const repo = await getInstallationRepo(session.installationId, id)
      await saveScanResult(session.installationId, repo?.fullName ?? id, result)
      return result
    } catch (err) {
      if (err instanceof ScanError) {
        const status = err.code === 'repo_not_found' ? 404 : err.code === 'scanner_missing' ? 503 : 502
        req.log.warn({ err: err.message, code: err.code }, 'scan failed')
        // Don't record "repo not found" / missing-scanner as a repo scan failure.
        if (err.code === 'clone_failed' || err.code === 'scan_failed') {
          const repo = await getInstallationRepo(session.installationId, id).catch(() => undefined)
          await recordScanFailure(session.installationId, id, repo?.fullName ?? id, err.message).catch(() => {})
        }
        return reply.code(status).send({ error: err.code, message: err.message })
      }
      req.log.error({ err }, 'unexpected scan error')
      return reply.code(500).send({ error: 'scan_error', message: 'The scan failed unexpectedly.' })
    }
  })

  // Preview the (deterministic) fix for a dependency finding — no PR opened yet.
  // Groundwork for the validated fix loop (roadmap step 4).
  app.post('/api/repos/:id/fix-preview', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })

    const { id } = req.params as { id: string }
    const { fingerprint } = (req.body ?? {}) as { fingerprint?: string }
    if (!fingerprint) return reply.code(400).send({ error: 'bad_request', message: 'fingerprint is required.' })

    const finding = await getFinding(session.installationId, id, fingerprint)
    if (!finding) return reply.code(404).send({ error: 'not_found', message: 'Finding not found.' })

    const plan = planDependencyFix(finding)
    if (!plan) {
      return reply.code(422).send({
        error: 'no_auto_fix',
        message:
          finding.category === 'Secret'
            ? 'Secrets are fixed by rotation, not a code change.'
            : 'No automatic fix is available for this finding yet.',
      })
    }
    return { plan }
  })

  // Run the validated fix loop and open a PR for a dependency finding.
  app.post('/api/repos/:id/fix', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })

    const { id } = req.params as { id: string }
    const { fingerprint } = (req.body ?? {}) as { fingerprint?: string }
    if (!fingerprint) return reply.code(400).send({ error: 'bad_request', message: 'fingerprint is required.' })

    const finding = await getFinding(session.installationId, id, fingerprint)
    if (!finding) return reply.code(404).send({ error: 'not_found', message: 'Finding not found.' })

    try {
      const outcome = await runDependencyFix(session.installationId, id, finding)
      return outcome
    } catch (err) {
      if (err instanceof FixError) {
        const status =
          err.code === 'unsupported'
            ? 422
            : err.code === 'not_resolved' || err.code === 'tests_failed'
              ? 409
              : 502
        req.log.warn({ code: err.code, err: err.message }, 'fix failed')
        return reply.code(status).send({ error: err.code, message: err.message })
      }
      req.log.error({ err }, 'unexpected fix error')
      return reply.code(500).send({ error: 'fix_error', message: 'The fix failed unexpectedly.' })
    }
  })

  // Recent scans across all repos (powers the Scan history screen).
  app.get('/api/scans', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })
    const scans = await listRecentScans(session.installationId)
    return { scans }
  })

  // Opened fix pull requests (powers the Fixes screen).
  app.get('/api/fixes', async (req, reply) => {
    const session = sessionFromRequest(req)
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })
    const fixes = await listFixes(session.installationId)
    return { fixes }
  })
}
