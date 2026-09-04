import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { Database } from '@/core/database'
import type { Migrator as MigratorContract } from '@/core/migrator'
import { TOKENS } from '@/core/tokens'
import { inject, injectable } from '@/utils/decorators'

@injectable()
export class Migrator implements MigratorContract {
	constructor(@inject(TOKENS.Database) private readonly database: Database) {}

	run(): void {
		const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
		migrate(this.database.db, { migrationsFolder })
	}
}
