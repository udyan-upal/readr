import { TEST_BASE_URL, TEST_JWT_KEY } from '@tests/helpers/test-app'
import { describe, expect, it } from 'vitest'
import { JweTokenService } from '@/auth/jwe-token.service'

function mintClaims() {
	const now = Math.floor(Date.now() / 1000)
	return {
		sub: 'user-1',
		email: 'user@example.com',
		iss: TEST_BASE_URL,
		aud: TEST_BASE_URL,
		exp: now + 3600,
	}
}

describe('jwe token service', () => {
	it('round-trips a payload that carries matching issuer and audience', async () => {
		const service = new JweTokenService(TEST_JWT_KEY)
		const token = await service.sign(mintClaims())

		expect(token.split('.')).toHaveLength(5)

		const payload = await service.verify(token, { issuer: TEST_BASE_URL, audience: TEST_BASE_URL })
		expect(payload.sub).toBe('user-1')
		expect(payload.email).toBe('user@example.com')
	})

	it('rejects tokens encrypted with a different key', async () => {
		const minting = new JweTokenService(TEST_JWT_KEY)
		const verifying = new JweTokenService(new Uint8Array(32).fill(9))
		const token = await minting.sign(mintClaims())

		await expect(
			verifying.verify(token, { issuer: TEST_BASE_URL, audience: TEST_BASE_URL }),
		).rejects.toThrow()
	})

	it('rejects tokens whose issuer does not match', async () => {
		const service = new JweTokenService(TEST_JWT_KEY)
		const token = await service.sign({ ...mintClaims(), iss: 'http://other.test' })

		await expect(
			service.verify(token, { issuer: TEST_BASE_URL, audience: TEST_BASE_URL }),
		).rejects.toThrow()
	})

	it('rejects malformed tokens', async () => {
		const service = new JweTokenService(TEST_JWT_KEY)

		await expect(
			service.verify('garbage', { issuer: TEST_BASE_URL, audience: TEST_BASE_URL }),
		).rejects.toThrow()
	})
})
