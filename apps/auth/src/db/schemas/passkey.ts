import * as t from 'drizzle-orm/sqlite-core'
import { sqliteTable } from 'drizzle-orm/sqlite-core'
import { user } from './user'

export const passkey = sqliteTable('passkey', {
	id: t.text('id').primaryKey(),
	name: t.text('name'),
	publicKey: t.text('public_key').notNull(),
	userId: t
		.text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	credentialID: t.text('credential_id').notNull(),
	counter: t.integer('counter').notNull(),
	deviceType: t.text('device_type').notNull(),
	backedUp: t.integer('backed_up').notNull(),
	transports: t.text('transports'),
	createdAt: t.integer('created_at', { mode: 'timestamp_ms' }),
	aaguid: t.text('aaguid'),
})
