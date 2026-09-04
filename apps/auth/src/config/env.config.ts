import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { ZodError } from 'zod'
import { type EnvConfig, envSchema } from '@/config/env.schema'

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export type { EnvConfig }

/** Validates a raw env record. Single validation path for prod and tests. */
export function parseEnvConfig(env: Record<string, string | undefined>): EnvConfig {
	try {
		return envSchema.parse(env)
	} catch (error) {
		if (error instanceof ZodError) {
			throw new Error(error.issues.map((issue) => issue.message).join('\n'))
		}
		throw error
	}
}

/** Loads and validates the runtime environment (.env file + process env). */
export function loadEnvConfig(): EnvConfig {
	const envPath = resolve(APP_ROOT, '.env')
	const fileEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}
	return parseEnvConfig({ ...fileEnv, ...process.env })
}
