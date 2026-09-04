import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Unused in JWE mode: access tokens are encrypted with the shared
// JWT_ENCRYPTION_KEY. Kept because the Better Auth jwt() plugin declares
// the table in its schema.
export const jwks = sqliteTable('jwks', {
	id: text('id').primaryKey(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }),
})
