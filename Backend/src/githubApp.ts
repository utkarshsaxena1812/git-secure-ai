import { App, Octokit } from 'octokit'
import { config, githubConfigured, oauthCallbackUrl } from './config.js'
import { langColor, type Repo } from './types.js'

// A single App instance owns: app-level JWT auth, per-installation tokens, and the
// user OAuth web flow. Built lazily so the server can boot without credentials.
let appInstance: App | null = null

function getApp(): App {
  if (!githubConfigured) {
    throw new Error('GitHub App is not configured — set the GITHUB_* vars in .env')
  }
  if (!appInstance) {
    appInstance = new App({
      appId: config.github.appId!,
      privateKey: config.github.privateKey!,
      oauth: {
        clientId: config.github.clientId!,
        clientSecret: config.github.clientSecret!,
      },
    })
  }
  return appInstance
}

/** URL that kicks off the user-authorization web flow. */
export function getAuthorizationUrl(state: string): string {
  const { url } = getApp().oauth.getWebFlowAuthorizationUrl({
    state,
    redirectUrl: oauthCallbackUrl,
  })
  return url
}

/** Where to send a user who hasn't installed the app on any account yet. */
export function getInstallUrl(state: string): string {
  const slug = config.github.appSlug ?? ''
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`
}

/** Exchanges an OAuth `code` for a user access token. */
export async function exchangeCodeForToken(code: string, state: string): Promise<string> {
  const { authentication } = await getApp().oauth.createToken({ code, state })
  return authentication.token
}

export type GithubUser = { login: string; name: string | null; avatarUrl: string }

export async function getUser(userToken: string): Promise<GithubUser> {
  const octokit = new Octokit({ auth: userToken })
  const { data } = await octokit.request('GET /user')
  return { login: data.login, name: data.name ?? null, avatarUrl: data.avatar_url }
}

export type UserInstallation = { id: number; accountLogin: string }

/** Installations of THIS app that the authenticated user can access. */
export async function getUserInstallations(userToken: string): Promise<UserInstallation[]> {
  const octokit = new Octokit({ auth: userToken })
  const { data } = await octokit.request('GET /user/installations', { per_page: 100 })
  return data.installations.map((i) => ({
    id: i.id,
    accountLogin: (i.account && 'login' in i.account ? i.account.login : '') || '',
  }))
}

/** Mints a short-lived installation access token (used to clone private repos). */
export async function getInstallationToken(installationId: number): Promise<string> {
  const { data } = await getApp().octokit.request(
    'POST /app/installations/{installation_id}/access_tokens',
    { installation_id: installationId },
  )
  return data.token
}

export type RepoCloneInfo = { fullName: string; cloneUrl: string; defaultBranch: string }

/** Resolves clone metadata for one repo id within an installation. */
export async function getInstallationRepo(
  installationId: number,
  repoId: string,
): Promise<RepoCloneInfo | undefined> {
  const octokit = await getApp().getInstallationOctokit(installationId)
  const repos = await octokit.paginate('GET /installation/repositories', { per_page: 100 })
  const r = repos.find((x) => String(x.id) === String(repoId))
  if (!r) return undefined
  return { fullName: r.full_name, cloneUrl: r.clone_url, defaultBranch: r.default_branch }
}

export type FileChange = { path: string; content: string }

export type OpenPrParams = {
  branch: string
  baseBranch?: string
  files: FileChange[]
  message: string
  title: string
  body: string
}

/**
 * Creates a branch, commits one or more file changes in a single commit (via the
 * Git Data API), and opens a PR. Never pushes to the base branch (principle #1).
 */
export async function openPullRequest(
  installationId: number,
  repoFullName: string,
  params: OpenPrParams,
): Promise<{ url: string; number: number; baseBranch: string }> {
  const octokit = await getApp().getInstallationOctokit(installationId)
  const [owner, repo] = repoFullName.split('/')

  const { data: repoData } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo })
  const base = params.baseBranch ?? repoData.default_branch

  const { data: baseRef } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    owner,
    repo,
    ref: `heads/${base}`,
  })
  const baseSha = baseRef.object.sha

  const { data: baseCommit } = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
    owner,
    repo,
    commit_sha: baseSha,
  })

  const { data: tree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: params.files.map((f) => ({
      path: f.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: f.content,
    })),
  })

  const { data: commit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
    owner,
    repo,
    message: params.message,
    tree: tree.sha,
    parents: [baseSha],
  })

  await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner,
    repo,
    ref: `refs/heads/${params.branch}`,
    sha: commit.sha,
  })

  const { data: pr } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    title: params.title,
    head: params.branch,
    base,
    body: params.body,
  })
  return { url: pr.html_url, number: pr.number, baseBranch: base }
}

/** Whether a branch has protection rules (used to gate auto-merge — principle #5). */
export async function isBranchProtected(
  installationId: number,
  repoFullName: string,
  branch: string,
): Promise<boolean> {
  const octokit = await getApp().getInstallationOctokit(installationId)
  const [owner, repo] = repoFullName.split('/')
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', { owner, repo, branch })
    return Boolean(data.protected)
  } catch {
    return false
  }
}

/** Merges a pull request (squash). Returns false if GitHub blocks it (e.g. checks/conflicts). */
export async function mergePullRequest(
  installationId: number,
  repoFullName: string,
  pullNumber: number,
): Promise<{ merged: boolean; message?: string }> {
  const octokit = await getApp().getInstallationOctokit(installationId)
  const [owner, repo] = repoFullName.split('/')
  try {
    const { data } = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: 'squash',
    })
    return { merged: Boolean(data.merged) }
  } catch (err) {
    return { merged: false, message: (err as Error).message }
  }
}

/** Lists repos reachable through an installation, normalized to the frontend Repo shape. */
export async function listInstallationRepos(installationId: number): Promise<Repo[]> {
  const octokit = await getApp().getInstallationOctokit(installationId)
  const repos = await octokit.paginate('GET /installation/repositories', { per_page: 100 })
  return repos.map((r) => ({
    id: String(r.id),
    name: r.full_name,
    visibility: r.private ? 'private' : 'public',
    language: r.language ?? 'Unknown',
    langColor: langColor(r.language),
    lastScan: null,
    findingIds: [],
    initialStatus: 'unscanned' as const,
  }))
}
