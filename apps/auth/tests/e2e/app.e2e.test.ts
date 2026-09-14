import { createTestApp } from '@tests/helpers/test-app'
import { describe, expect, it } from 'vitest'

describe('app', () => {
	it('serves the health endpoint', async () => {
		const { app } = await createTestApp()

		const res = await app.request('/health')

		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ status: 'ok' })
	})
})
