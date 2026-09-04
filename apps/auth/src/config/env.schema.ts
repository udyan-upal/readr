import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const SECRET_MESSAGE = 'BETTER_AUTH_SECRET is required and must be at least 32 characters'
const URL_REQUIRED_MESSAGE = 'BETTER_AUTH_URL is required (e.g. http://localhost:3000)'
const KEY_REQUIRED_MESSAGE =
	'JWT_ENCRYPTION_KEY is required (generate with: openssl rand -base64 32)'
const OTLP_ENDPOINT_MESSAGE =
	'OTEL_EXPORTER_OTLP_ENDPOINT must be a valid http(s) URL, e.g. http://localhost:4318'
const LOG_LEVEL_MESSAGE = 'LOG_LEVEL must be one of: debug, info, warn, error'
const LOG_MODE_MESSAGE =
	'LOG_MODE must be one of: stdout, otlp, both (otlp/both require OTEL_EXPORTER_OTLP_ENDPOINT)'

/**
 * Raw environment variables -> validated config. Field-level checks cover
 * presence/shape; the transform applies cross-field rules (URL protocol,
 * key byte length, port integer, database path resolution).
 */
export const envSchema = z
	.object({
		BETTER_AUTH_SECRET: z.string({ error: SECRET_MESSAGE }).min(32, SECRET_MESSAGE),
		BETTER_AUTH_URL: z.string({ error: URL_REQUIRED_MESSAGE }),
		JWT_ENCRYPTION_KEY: z.string({ error: KEY_REQUIRED_MESSAGE }),
		PORT: z.string().optional(),
		DATABASE_PATH: z.string().optional(),
		OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
		OTEL_SERVICE_NAME: z.string().optional(),
		OTEL_SDK_DISABLED: z.string().optional(),
		LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error'], { error: LOG_LEVEL_MESSAGE }).optional(),
		LOG_MODE: z.enum(['stdout', 'otlp', 'both'], { error: LOG_MODE_MESSAGE }).optional(),
	})
	.transform((env, ctx) => {
		const parsedUrl = URL.parse(env.BETTER_AUTH_URL)
		if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
			ctx.addIssue({
				code: 'custom',
				message: `BETTER_AUTH_URL must be a valid http(s) URL, got: ${env.BETTER_AUTH_URL}`,
				input: env.BETTER_AUTH_URL,
			})
		}

		const jwtEncryptionKey = new Uint8Array(Buffer.from(env.JWT_ENCRYPTION_KEY, 'base64'))
		if (jwtEncryptionKey.byteLength !== 32) {
			ctx.addIssue({
				code: 'custom',
				message: `JWT_ENCRYPTION_KEY must decode to exactly 32 bytes for A256GCM, got ${jwtEncryptionKey.byteLength}`,
				input: env.JWT_ENCRYPTION_KEY,
			})
		}

		const port = Number(env.PORT ?? 3000)
		if (!Number.isInteger(port) || port <= 0) {
			ctx.addIssue({
				code: 'custom',
				message: `PORT must be a positive integer, got: ${env.PORT}`,
				input: env.PORT,
				path: ['PORT'],
			})
		}

		const rawPath = env.DATABASE_PATH
		const databasePath = !rawPath
			? resolve(APP_ROOT, 'data/auth.db')
			: rawPath === ':memory:'
				? ':memory:'
				: isAbsolute(rawPath)
					? rawPath
					: resolve(APP_ROOT, rawPath)

		const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || undefined
		if (otlpEndpoint) {
			const parsedEndpoint = URL.parse(otlpEndpoint)
			if (
				!parsedEndpoint ||
				(parsedEndpoint.protocol !== 'http:' && parsedEndpoint.protocol !== 'https:')
			) {
				ctx.addIssue({
					code: 'custom',
					message: OTLP_ENDPOINT_MESSAGE,
					input: otlpEndpoint,
					path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
				})
			}
		}

		const logLevel = env.LOG_LEVEL ?? 'info'
		const logMode = env.LOG_MODE ?? 'stdout'
		if (logMode !== 'stdout' && !otlpEndpoint) {
			ctx.addIssue({
				code: 'custom',
				message: LOG_MODE_MESSAGE,
				input: logMode,
				path: ['LOG_MODE'],
			})
		}

		return {
			betterAuthSecret: env.BETTER_AUTH_SECRET,
			betterAuthUrl: env.BETTER_AUTH_URL,
			jwtEncryptionKey,
			port,
			databasePath,
			otlpEndpoint,
			otelServiceName: env.OTEL_SERVICE_NAME?.trim() || 'auth',
			otelSdkDisabled: env.OTEL_SDK_DISABLED === 'true',
			logLevel,
			logMode,
		}
	})

export type EnvConfig = z.output<typeof envSchema>
