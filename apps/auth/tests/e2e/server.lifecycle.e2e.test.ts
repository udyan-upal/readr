import { rmSync } from 'node:fs'
import { type LiveServer, startLiveServer } from '@tests/helpers/live-server'
import { afterEach, describe, expect, it } from 'vitest'

const spawned: LiveServer[] = []

// Failures must never leak processes or temp databases.
afterEach(() => {
	for (const server of spawned.splice(0)) {
		if (server.child.exitCode === null) {
			server.child.kill('SIGKILL')
		}
		rmSync(server.databaseDir, { recursive: true, force: true })
	}
})

async function awaitExit(server: LiveServer, timeoutMs: number) {
	return Promise.race([
		server.exit,
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				server.child.kill('SIGKILL')
				reject(new Error(`server did not exit within ${timeoutMs}ms. output:\n${server.output()}`))
			}, timeoutMs)
		}),
	])
}

describe('live server lifecycle', () => {
	it('serves the full auth flow over real HTTP and exits cleanly on SIGTERM', async () => {
		const server = await startLiveServer()
		spawned.push(server)

		const health = await fetch(`${server.baseUrl}/health`)
		expect(health.status).toBe(200)
		expect(await health.json()).toEqual({ status: 'ok' })

		const jsonHeaders = { 'content-type': 'application/json' }
		const email = 'live@example.com'
		const password = 'sup3rsecret-password'

		const signUp = await fetch(`${server.baseUrl}/api/auth/sign-up/email`, {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify({ email, name: 'Live User', password }),
		})
		expect(signUp.status).toBeLessThan(300)

		const signIn = await fetch(`${server.baseUrl}/api/auth/sign-in/email`, {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify({ email, password }),
		})
		expect(signIn.status).toBeLessThan(300)
		expect(signIn.headers.getSetCookie()).toEqual([])
		const sessionToken = signIn.headers.get('set-auth-token')
		expect(sessionToken).toBeTruthy()

		const tokenRes = await fetch(`${server.baseUrl}/api/auth/token`, {
			headers: { authorization: `Bearer ${sessionToken}` },
		})
		expect(tokenRes.status).toBe(200)
		const { token } = (await tokenRes.json()) as { token: string }
		expect(token.split('.')).toHaveLength(5)

		const me = await fetch(`${server.baseUrl}/api/me`, {
			headers: { authorization: `Bearer ${token}` },
		})
		expect(me.status).toBe(200)
		const body = (await me.json()) as { id: string; email: string; name: string }
		expect(body.email).toBe(email)
		expect(body.name).toBe('Live User')
		expect(body.id).toBeTypeOf('string')

		server.child.kill('SIGTERM')
		const exited = await awaitExit(server, 10_000)
		// exit code 0 proves the graceful path ran process.exit(0), not signal death
		expect(exited.code).toBe(0)
		expect(exited.signal).toBeNull()

		await expect(fetch(`${server.baseUrl}/health`)).rejects.toThrow()
	}, 30_000)

	it('exits cleanly on SIGINT', async () => {
		const server = await startLiveServer()
		spawned.push(server)

		const health = await fetch(`${server.baseUrl}/health`)
		expect(health.status).toBe(200)

		server.child.kill('SIGINT')
		const exited = await awaitExit(server, 10_000)
		expect(exited.code).toBe(0)
		expect(exited.signal).toBeNull()
	}, 30_000)
})
