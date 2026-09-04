import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { Database as DatabaseContract } from '@/core/database'
import * as schema from '@/db/schemas/index'

/** Owns the sqlite connection and the drizzle instance built over it. */
export class Database implements DatabaseContract {
	readonly db: BetterSQLite3Database<typeof schema>
	readonly sqlite: BetterSqlite3.Database

	constructor(path: string) {
		if (path !== ':memory:') {
			mkdirSync(dirname(path), { recursive: true })
		}
		this.sqlite = new BetterSqlite3(path)
		this.sqlite.pragma('foreign_keys = ON')
		if (path !== ':memory:') {
			this.sqlite.pragma('journal_mode = WAL')
		}
		this.db = drizzle(this.sqlite, { schema })
	}

	close(): void {
		this.sqlite.close()
	}
}
