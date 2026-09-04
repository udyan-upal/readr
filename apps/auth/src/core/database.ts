import type BetterSqlite3 from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schemas/index'

/** Owns the sqlite connection and the drizzle instance built over it. */
export interface Database {
	readonly db: BetterSQLite3Database<typeof schema>
	readonly sqlite: BetterSqlite3.Database
	close(): void
}
