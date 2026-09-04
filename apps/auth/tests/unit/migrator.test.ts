import { describe, expect, it } from 'vitest'
import { Database } from '@/db/database'
import { Migrator } from '@/db/migrator'

function tableNames(database: Database) {
	const rows = database.sqlite
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
		.all() as { name: string }[]
	return rows.map((row) => row.name)
}

describe('migrator', () => {
	it('creates the auth tables', () => {
		const database = new Database(':memory:')

		new Migrator(database).run()

		const tables = tableNames(database)
		for (const table of ['user', 'session', 'account', 'verification', 'jwks']) {
			expect(tables).toContain(table)
		}
		const count = database.sqlite.prepare('SELECT count(*) AS n FROM user').get() as { n: number }
		expect(count.n).toBe(0)
	})

	it('runs idempotently', () => {
		const database = new Database(':memory:')
		const migrator = new Migrator(database)

		migrator.run()
		expect(() => migrator.run()).not.toThrow()
	})
})
