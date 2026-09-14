import { createTestApp } from '@tests/helpers/test-app'
import { describe, expect, it } from 'vitest'

const EMAIL = 'user@example.com'
const PASSWORD = 'sup3rsecret-password'

function signUp(app: Awaited<ReturnType<typeof createTestApp>>['app']) {
	return app.request('/api/auth/sign-up/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, name: 'Test User', password: PASSWORD }),
	})
}

async function signIn(app: Awaited<ReturnType<typeof createTestApp>>['app']) {
	const res = await app.request('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
	})
	expect(res.status).toBeLessThan(300)
	return res
}

async function mintJwe(app: Awaited<ReturnType<typeof createTestApp>>['app']) {
	await signUp(app)
	const signInRes = await signIn(app)
	const sessionToken = signInRes.headers.get('set-auth-token')
	expect(sessionToken).toBeTruthy()
	const tokenRes = await app.request('/api/auth/token', {
		headers: { authorization: `Bearer ${sessionToken}` },
	})
	expect(tokenRes.status).toBe(200)
	const { token } = (await tokenRes.json()) as { token: string }
	return token
}

describe('stateless bearer flow', () => {
	it('exposes the token headers to cross-origin browser JS', async () => {
		const { app } = await createTestApp()

		const res = await app.request('/api/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
			body: JSON.stringify({ email: EMAIL, name: 'Test User', password: PASSWORD }),
		})

		// Without Access-Control-Expose-Headers, fetch() cannot read set-auth-token
		// and sign-in silently yields no token in the browser.
		const exposed = res.headers.get('access-control-expose-headers') ?? ''
		expect(exposed.toLowerCase()).toContain('set-auth-token')
		expect(exposed.toLowerCase()).toContain('set-auth-jwt')
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3001')
	})

	it('rejects duplicate email sign-up', async () => {
		const { app } = await createTestApp()

		const first = await signUp(app)
		expect(first.status).toBeLessThan(300)
		const duplicate = await signUp(app)
		expect(duplicate.status).toBe(422)
	})

	it('rejects wrong password', async () => {
		const { app } = await createTestApp()
		await signUp(app)

		const res = await app.request('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: 'wrong-password' }),
		})
		expect(res.status).toBe(401)
	})

	it('never sets cookies on auth responses but exposes the session token header', async () => {
		const { app } = await createTestApp()

		const up = await signUp(app)
		expect(up.headers.getSetCookie()).toEqual([])
		expect(up.headers.get('set-cookie')).toBeNull()

		const signInRes = await signIn(app)
		expect(signInRes.headers.getSetCookie()).toEqual([])
		expect(signInRes.headers.get('set-cookie')).toBeNull()
		expect(signInRes.headers.get('set-auth-token')).toBeTruthy()
	})

	it('mints a JWE via /api/auth/token that authenticates /api/me', async () => {
		const { app } = await createTestApp()
		const token = await mintJwe(app)

		expect(token.split('.')).toHaveLength(5)

		const res = await app.request('/api/me', { headers: { authorization: `Bearer ${token}` } })
		expect(res.status).toBe(200)
		const body = (await res.json()) as { id: string; email: string; name: string }
		expect(body.email).toBe(EMAIL)
		expect(body.name).toBe('Test User')
		expect(body.id).toBeTypeOf('string')
	})

	it('rejects /api/me without, malformed, or tampered bearer tokens', async () => {
		const { app } = await createTestApp()
		const token = await mintJwe(app)
		const parts = token.split('.')
		const ciphertext = parts[2] ?? ''
		expect(ciphertext.length).toBeGreaterThan(0)
		parts[2] = `${ciphertext.startsWith('A') ? 'B' : 'A'}${ciphertext.slice(1)}`
		const tampered = parts.join('.')

		expect((await app.request('/api/me')).status).toBe(401)
		expect(
			(await app.request('/api/me', { headers: { authorization: 'Bearer garbage' } })).status,
		).toBe(401)
		expect(
			(await app.request('/api/me', { headers: { authorization: `Bearer ${tampered}` } })).status,
		).toBe(401)
	})

	it('sign-out kills the session token but not the JWE (no server-side revocation)', async () => {
		const { app } = await createTestApp()
		await signUp(app)
		const signInRes = await signIn(app)
		const sessionToken = signInRes.headers.get('set-auth-token')
		const jwe = await mintJwe(app)

		const out = await app.request('/api/auth/sign-out', {
			method: 'POST',
			headers: { authorization: `Bearer ${sessionToken}` },
		})
		expect(out.status).toBeLessThan(300)

		// The session token no longer mints tokens...
		const tokenRes = await app.request('/api/auth/token', {
			headers: { authorization: `Bearer ${sessionToken}` },
		})
		expect(tokenRes.status).toBe(401)

		// ...but an already-minted JWE stays valid until it expires.
		expect(
			(await app.request('/api/me', { headers: { authorization: `Bearer ${jwe}` } })).status,
		).toBe(200)
	})
})
