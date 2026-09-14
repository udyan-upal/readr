import { describe, expect, it } from 'vitest'
import { Database } from '@/db/database'
import { Migrator } from '@/db/migrator'

async function tableNames(database: Database) {
	const result = await database.client.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table'",
	)
	return result.rows.map((row) => row.name as string)
}

describe('migrator', () => {
	it('creates the auth tables', async () => {
		const database = new Database(':memory:')

		await new Migrator(database).run()

		const tables = await tableNames(database)
		for (const table of ['user', 'session', 'account', 'verification', 'jwks']) {
			expect(tables).toContain(table)
		}
		const count = await database.client.execute('SELECT count(*) AS n FROM user')
		expect(count.rows[0]?.n).toBe(0)
	})

	it('runs idempotently', async () => {
		const database = new Database(':memory:')
		const migrator = new Migrator(database)

		await migrator.run()
		await expect(migrator.run()).resolves.toBeUndefined()
	})
})
