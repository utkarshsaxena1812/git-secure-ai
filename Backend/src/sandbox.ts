import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from './config.js'

const exec = promisify(execFile)
const IS_WIN = process.platform === 'win32'
const NPM_CMD = IS_WIN ? 'npm.cmd' : 'npm'

let dockerAvailable: boolean | null = null

/** True only when the Docker daemon is reachable (cached after first check). */
export async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailable !== null) return dockerAvailable
  try {
    await exec('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000, shell: IS_WIN })
    dockerAvailable = true
  } catch {
    dockerAvailable = false
  }
  return dockerAvailable
}

/**
 * Runs an npm command against a host directory of untrusted code.
 *
 * - SANDBOX_MODE=docker (+ daemon up): runs inside an ephemeral, non-networked-by
 *   default, CPU/memory/pid-limited container with only that directory mounted.
 * - otherwise: runs on the host but with a **secret-stripped environment** so the
 *   project's install/test scripts can't read GITHUB_*, SESSION_SECRET, DATABASE_URL, etc.
 *
 * Returns whether real container isolation was used (for honest reporting).
 */
export async function runNpm(
  args: string[],
  opts: { cwd: string; timeout: number; network?: boolean },
): Promise<{ sandboxed: boolean }> {
  if (config.sandboxMode === 'docker' && (await isDockerAvailable())) {
    await dockerRunNpm(args, opts)
    return { sandboxed: true }
  }
  await exec(NPM_CMD, args, {
    cwd: opts.cwd,
    timeout: opts.timeout,
    maxBuffer: 1024 * 1024 * 64,
    shell: IS_WIN,
    env: minimalEnv(),
  })
  return { sandboxed: false }
}

async function dockerRunNpm(
  args: string[],
  opts: { cwd: string; timeout: number; network?: boolean },
): Promise<void> {
  const dockerArgs = [
    'run',
    '--rm',
    '--network',
    opts.network === false ? 'none' : 'bridge',
    '--cpus',
    '2',
    '--memory',
    '2g',
    '--pids-limit',
    '512',
    '-e',
    'HOME=/tmp',
    '-v',
    `${opts.cwd}:/work`,
    '-w',
    '/work',
    config.sandboxImage,
    'npm',
    ...args,
  ]
  await exec('docker', dockerArgs, { timeout: opts.timeout, maxBuffer: 1024 * 1024 * 64, shell: IS_WIN })
}

// A minimal environment for untrusted subprocesses: keep only what the toolchain
// needs to run, drop everything else (notably our .env secrets).
function minimalEnv(): NodeJS.ProcessEnv {
  const keep = IS_WIN
    ? ['Path', 'PATH', 'SystemRoot', 'SystemDrive', 'windir', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'NUMBER_OF_PROCESSORS', 'OS']
    : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'USER', 'SHELL']
  const env: NodeJS.ProcessEnv = {}
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k]
  return env
}
