import { createTestApp, TEST_BASE_URL, TEST_JWT_KEY } from '@tests/helpers/test-app'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { describe, expect, it } from 'vitest'

const EMAIL = 'user@example.com'
const PASSWORD = 'sup3rsecret-password'

async function mintJweFromEndpoint(app: ReturnType<typeof createTestApp>['app']) {
	await app.request('/api/auth/sign-up/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, name: 'Test User', password: PASSWORD }),
	})
	const signInRes = await app.request('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
	})
	const sessionToken = signInRes.headers.get('set-auth-token')
	const tokenRes = await app.request('/api/auth/token', {
		headers: { authorization: `Bearer ${sessionToken}` },
	})
	expect(tokenRes.status).toBe(200)
	return ((await tokenRes.json()) as { token: string }).token
}

describe('jwe tokens', () => {
	it('disables the jwks endpoint (no public keys in JWE mode)', async () => {
		const { app } = createTestApp()

		const res = await app.request('/api/auth/jwks')

		expect(res.status).toBe(404)
	})

	it('issues an encrypted token decryptable only with the shared key', async () => {
		const { app } = createTestApp()
		const token = await mintJweFromEndpoint(app)

		const { payload } = await jwtDecrypt(token, TEST_JWT_KEY, {
			issuer: TEST_BASE_URL,
			audience: TEST_BASE_URL,
		})
		expect(payload.sub).toBeTypeOf('string')
		expect(payload.email).toBe(EMAIL)
		expect(payload.iss).toBe(TEST_BASE_URL)
		expect(payload.aud).toBe(TEST_BASE_URL)

		// The ciphertext must not leak the plaintext claims.
		expect(token).not.toContain(EMAIL)
		expect(token.split('.')).toHaveLength(5)
	})

	it('rejects tokens minted with a different key', async () => {
		const { app } = createTestApp()
		const token = await mintJweFromEndpoint(app)

		const wrongKey = new Uint8Array(32).fill(9)
		await expect(jwtDecrypt(token, wrongKey)).rejects.toThrow()
	})

	it('rejects expired tokens even though they decrypt cleanly', async () => {
		const { app } = createTestApp()
		const expired = await new EncryptJWT({ sub: 'user-id', email: EMAIL })
			.setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
			.setIssuer(TEST_BASE_URL)
			.setAudience(TEST_BASE_URL)
			.setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
			.setExpirationTime(Math.floor(Date.now() / 1000) - 60)
			.encrypt(TEST_JWT_KEY)

		const res = await app.request('/api/me', { headers: { authorization: `Bearer ${expired}` } })
		expect(res.status).toBe(401)
	})
})
