import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { drizzle } from 'drizzle-orm/libsql'
import type { Database as DatabaseContract } from '@/core/database'
import * as schema from '@/db/schemas/index'

/**
 * Owns the libSQL client and the drizzle instance built over it.
 * Connection-scoped pragmas (foreign_keys, journal_mode) are not set here:
 * remote Turso serves each request on its own connection, so they would not
 * stick. Foreign-key enforcement is the server's concern.
 */
/**
 * libSQL will not create a missing directory for a `file:` database — it fails
 * with SQLITE_CANTOPEN (14). Remote and `:memory:` URLs have no parent to make.
 */
function ensureParentDir(url: string): void {
	if (!url.startsWith('file:')) return
	const path = url.slice('file:'.length).replace(/^\/\//, '/').split('?')[0]
	if (path) mkdirSync(dirname(path), { recursive: true })
}

export class Database implements DatabaseContract {
	readonly db: LibSQLDatabase<typeof schema>
	readonly client: Client

	constructor(url: string, authToken?: string) {
		ensureParentDir(url)
		this.client = createClient({ url, ...(authToken ? { authToken } : {}) })
		this.db = drizzle(this.client, { schema })
	}

	close(): void {
		this.client.close()
	}
}
