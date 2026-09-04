import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEST_JWT_KEY } from '@tests/helpers/test-app'

// From tests/helpers/: apps/auth is ../../, the repo root is ../../../../.
const APP_DIR = fileURLToPath(new URL('../../', import.meta.url))
const TSX_BIN = fileURLToPath(new URL('../../../../node_modules/.bin/tsx', import.meta.url))

export interface LiveServer {
	child: ChildProcess
	baseUrl: string
	databaseDir: string
	exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
	output: () => string
}

/** The env schema rejects PORT=0, so a free port must be pre-picked with a probe socket. */
function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer()
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number }
			probe.close(() => resolve(port))
		})
		probe.on('error', reject)
	})
}

/**
 * Spawns the real application (`src/index.ts`) as a subprocess — the only way to
 * exercise the signal handlers, since `Application.stop()` ends in `process.exit(0)`.
 * The absolute DATABASE_PATH keeps the subprocess away from the repo's real database.
 */
export async function startLiveServer(): Promise<LiveServer> {
	const port = await getFreePort()
	const baseUrl = `http://127.0.0.1:${port}`
	const databaseDir = mkdtempSync(join(tmpdir(), 'auth-live-'))
	const child = spawn(TSX_BIN, ['src/index.ts'], {
		cwd: APP_DIR,
		env: {
			...process.env,
			BETTER_AUTH_SECRET: 'live-secret-that-is-at-least-32-chars!',
			BETTER_AUTH_URL: baseUrl,
			JWT_ENCRYPTION_KEY: Buffer.from(TEST_JWT_KEY).toString('base64'),
			DATABASE_PATH: join(databaseDir, 'auth.db'),
			PORT: String(port),
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let output = ''
	child.stdout?.on('data', (chunk) => (output += chunk))
	child.stderr?.on('data', (chunk) => (output += chunk))

	const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
		child.once('exit', (code, signal) => resolve({ code, signal }))
	})

	const deadline = Date.now() + 15_000
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			rmSync(databaseDir, { recursive: true, force: true })
			throw new Error(`live server exited before listening. output:\n${output}`)
		}
		try {
			const res = await fetch(`${baseUrl}/health`)
			if (res.ok) {
				return { child, baseUrl, databaseDir, exit, output: () => output }
			}
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	child.kill('SIGKILL')
	rmSync(databaseDir, { recursive: true, force: true })
	throw new Error(`live server never became ready. output:\n${output}`)
}
