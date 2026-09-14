import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Database } from '@/db/database'

describe('database', () => {
	it('opens an in-memory database and closes cleanly', async () => {
		const database = new Database(':memory:')

		const result = await database.client.execute('SELECT 1 AS n')
		expect(result.rows[0]?.n).toBe(1)
		expect(() => database.close()).not.toThrow()
		expect(database.client.closed).toBe(true)
	})

	it('creates missing parent directories for file: databases', async () => {
		const tmp = mkdtempSync(join(tmpdir(), 'auth-db-'))
		try {
			const path = join(tmp, 'nested', 'dir', 'auth.db')
			const database = new Database(`file:${path}`)

			expect(existsSync(join(tmp, 'nested', 'dir'))).toBe(true)
			await expect(database.client.execute('SELECT 1 AS n')).resolves.toBeTruthy()
			database.close()
		} finally {
			rmSync(tmp, { recursive: true, force: true })
		}
	})

	it('builds a remote client without connecting', () => {
		const database = new Database('libsql://db-org.turso.io', 'ey.token')

		expect(database.client.closed).toBe(false)
		database.close()
	})
})
