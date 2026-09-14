/** Applies pending drizzle migrations to the database. */
export interface Migrator {
	run(): Promise<void>
}
