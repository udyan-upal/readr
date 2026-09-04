import { TEST_BASE_URL, TEST_JWT_KEY } from '@tests/helpers/test-app'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { JweTokenService } from '@/auth/jwe-token.service'
import { parseEnvConfig } from '@/config/env.config'
import { BearerMiddleware } from '@/http/middleware/bearer.middleware'

async function mint(overrides: Record<string, unknown> = {}, key: Uint8Array = TEST_JWT_KEY) {
	return new JweTokenService(key).sign({
		sub: 'u1',
		email: 'user@example.com',
		iss: TEST_BASE_URL,
		aud: TEST_BASE_URL,
		exp: Math.floor(Date.now() / 1000) + 3600,
		...overrides,
	})
}

function probeApp() {
	const config = parseEnvConfig({
		BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-chars!',
		BETTER_AUTH_URL: TEST_BASE_URL,
		JWT_ENCRYPTION_KEY: Buffer.from(TEST_JWT_KEY).toString('base64'),
	})
	const mw = new BearerMiddleware(new JweTokenService(TEST_JWT_KEY), config)
	return new Hono()
		.use('/probe', mw.handler)
		.get('/probe', (c) => c.json({ claims: c.get('claims') }))
}

async function probeClaims(headers: Record<string, string>) {
	const res = await probeApp().request('/probe', { headers })
	expect(res.status).toBe(200)
	return ((await res.json()) as { claims: Record<string, unknown> | null }).claims
}

describe('bearer middleware', () => {
	it('sets claims for a valid bearer token', async () => {
		const claims = await probeClaims({ authorization: `Bearer ${await mint()}` })

		expect(claims?.sub).toBe('u1')
	})

	it('accepts an uppercase BEARER prefix', async () => {
		const claims = await probeClaims({ authorization: `BEARER ${await mint()}` })

		expect(claims?.sub).toBe('u1')
	})

	it('leaves claims null without an Authorization header', async () => {
		const claims = await probeClaims({})

		expect(claims).toBeNull()
	})

	it('leaves claims null for a non-bearer scheme', async () => {
		const claims = await probeClaims({ authorization: 'Basic abc' })

		expect(claims).toBeNull()
	})

	it('leaves claims null for malformed or wrong-key tokens without throwing', async () => {
		const wrongKey = new Uint8Array(32).fill(9)
		const claims = await probeClaims({
			authorization: `Bearer ${await mint({}, wrongKey)}`,
		})

		expect(await probeClaims({ authorization: 'Bearer garbage' })).toBeNull()
		expect(claims).toBeNull()
	})
})
