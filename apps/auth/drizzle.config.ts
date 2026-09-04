import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/db/schemas/index.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_PATH ?? './data/auth.db',
	},
})
