import { z } from 'zod'

const SECRET_MESSAGE = 'BETTER_AUTH_SECRET is required and must be at least 32 characters'
const URL_REQUIRED_MESSAGE = 'BETTER_AUTH_URL is required (e.g. http://localhost:3000)'
const KEY_REQUIRED_MESSAGE =
	'JWT_ENCRYPTION_KEY is required (generate with: openssl rand -base64 32)'
const TURSO_URL_REQUIRED_MESSAGE =
	'TURSO_DATABASE_URL is required (e.g. libsql://<db>-<org>.turso.io; get it with: turso db show <db> --url)'
const TURSO_URL_SCHEME_MESSAGE =
	'TURSO_DATABASE_URL must use libsql:, https:, http: or file:, or be :memory:'
const WEB_ORIGIN_MESSAGE = 'WEB_ORIGIN must be a valid http(s) URL, e.g. http://localhost:3001'
const TURSO_TOKEN_MESSAGE =
	'TURSO_AUTH_TOKEN is required for remote databases (create one with: turso db tokens create <db>)'
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
		TURSO_DATABASE_URL: z
			.string({ error: TURSO_URL_REQUIRED_MESSAGE })
			.min(1, TURSO_URL_REQUIRED_MESSAGE),
		TURSO_AUTH_TOKEN: z.string().optional(),
		WEB_ORIGIN: z.string().optional(),
		PORT: z.string().optional(),
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

		// The browser origin allowed to call this service. CORS must also expose
		// the token headers, or fetch() cannot read them (see http-app wiring).
		const webOrigin = env.WEB_ORIGIN?.trim() || 'http://localhost:3001'
		const parsedOrigin = URL.parse(webOrigin)
		if (
			!parsedOrigin ||
			(parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:')
		) {
			ctx.addIssue({
				code: 'custom',
				message: `${WEB_ORIGIN_MESSAGE}, got: ${webOrigin}`,
				input: webOrigin,
				path: ['WEB_ORIGIN'],
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

		// ':memory:' is libSQL's in-process database (tests); every other form
		// carries a scheme. libsql:/https: are remote, so they need a token —
		// http: (local sqld) and file: do not.
		const databaseUrl = env.TURSO_DATABASE_URL
		const databaseAuthToken = env.TURSO_AUTH_TOKEN?.trim() || undefined
		if (databaseUrl !== ':memory:') {
			const scheme = URL.parse(databaseUrl)?.protocol
			if (!scheme || !['libsql:', 'https:', 'http:', 'file:'].includes(scheme)) {
				ctx.addIssue({
					code: 'custom',
					message: `${TURSO_URL_SCHEME_MESSAGE}, got: ${databaseUrl}`,
					input: databaseUrl,
					path: ['TURSO_DATABASE_URL'],
				})
			} else if ((scheme === 'libsql:' || scheme === 'https:') && !databaseAuthToken) {
				ctx.addIssue({
					code: 'custom',
					message: TURSO_TOKEN_MESSAGE,
					input: databaseAuthToken,
					path: ['TURSO_AUTH_TOKEN'],
				})
			}
		}

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
			webOrigin,
			jwtEncryptionKey,
			port,
			databaseUrl,
			databaseAuthToken,
			otlpEndpoint,
			otelServiceName: env.OTEL_SERVICE_NAME?.trim() || 'auth',
			otelSdkDisabled: env.OTEL_SDK_DISABLED === 'true',
			logLevel,
			logMode,
		}
	})

export type EnvConfig = z.output<typeof envSchema>
