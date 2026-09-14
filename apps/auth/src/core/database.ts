import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '@/db/schemas/index'

/** Owns the libSQL client and the drizzle instance built over it. */
export interface Database {
	readonly db: LibSQLDatabase<typeof schema>
	readonly client: Client
	close(): void
}
