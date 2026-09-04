import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseEnvConfig } from '@/config/env.config'

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function base(): Record<string, string | undefined> {
	return {
		BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-chars!',
		BETTER_AUTH_URL: 'http://auth.test',
		JWT_ENCRYPTION_KEY: Buffer.from(new Uint8Array(32).map((_, i) => i + 1)).toString('base64'),
	}
}

describe('env config', () => {
	it('applies defaults for PORT and DATABASE_PATH', () => {
		const config = parseEnvConfig(base())

		expect(config.port).toBe(3000)
		expect(config.databasePath).toBe(resolve(APP_ROOT, 'data/auth.db'))
	})

	it('rejects a missing or too-short BETTER_AUTH_SECRET', () => {
		expect(() => parseEnvConfig({ ...base(), BETTER_AUTH_SECRET: undefined })).toThrow(
			/at least 32 characters/,
		)
		expect(() => parseEnvConfig({ ...base(), BETTER_AUTH_SECRET: 'a'.repeat(31) })).toThrow(
			/at least 32 characters/,
		)
	})

	it('rejects a missing or non-http(s) BETTER_AUTH_URL', () => {
		expect(() => parseEnvConfig({ ...base(), BETTER_AUTH_URL: undefined })).toThrow(
			/BETTER_AUTH_URL is required/,
		)
		expect(() => parseEnvConfig({ ...base(), BETTER_AUTH_URL: 'ftp://example.com' })).toThrow(
			/valid http\(s\) URL/,
		)
		expect(
			parseEnvConfig({ ...base(), BETTER_AUTH_URL: 'https://example.com' }).betterAuthUrl,
		).toBe('https://example.com')
	})

	it('rejects a missing JWT key and keys that do not decode to 32 bytes', () => {
		expect(() => parseEnvConfig({ ...base(), JWT_ENCRYPTION_KEY: undefined })).toThrow(
			/JWT_ENCRYPTION_KEY is required/,
		)
		const shortKey = Buffer.from(new Uint8Array(16)).toString('base64')
		expect(() => parseEnvConfig({ ...base(), JWT_ENCRYPTION_KEY: shortKey })).toThrow(/16/)
	})

	it('rejects invalid PORT values', () => {
		for (const port of ['abc', '0', '-1', '3000.5']) {
			expect(() => parseEnvConfig({ ...base(), PORT: port })).toThrow(/positive integer/)
		}
		expect(parseEnvConfig({ ...base(), PORT: '4000' }).port).toBe(4000)
	})

	it('resolves DATABASE_PATH relative, absolute, and :memory: variants', () => {
		expect(parseEnvConfig({ ...base(), DATABASE_PATH: ':memory:' }).databasePath).toBe(':memory:')
		expect(parseEnvConfig({ ...base(), DATABASE_PATH: './data/x.db' }).databasePath).toBe(
			resolve(APP_ROOT, 'data/x.db'),
		)
		const absolute = join(mkdtempSync(join(tmpdir(), 'auth-env-')), 'auth.db')
		expect(parseEnvConfig({ ...base(), DATABASE_PATH: absolute }).databasePath).toBe(absolute)
	})

	it('disables telemetry by default and applies OTEL_SERVICE_NAME default', () => {
		const config = parseEnvConfig(base())

		expect(config.otlpEndpoint).toBeUndefined()
		expect(config.otelServiceName).toBe('auth')
		expect(config.otelSdkDisabled).toBe(false)
	})

	it('passes through a valid OTLP endpoint and custom service name', () => {
		const config = parseEnvConfig({
			...base(),
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
			OTEL_SERVICE_NAME: 'auth-local',
		})

		expect(config.otlpEndpoint).toBe('http://localhost:4318')
		expect(config.otelServiceName).toBe('auth-local')
	})

	it('rejects a non-http(s) OTLP endpoint', () => {
		expect(() => parseEnvConfig({ ...base(), OTEL_EXPORTER_OTLP_ENDPOINT: 'grpc://x' })).toThrow(
			/valid http\(s\) URL/,
		)
	})

	it('honors OTEL_SDK_DISABLED', () => {
		expect(parseEnvConfig({ ...base(), OTEL_SDK_DISABLED: 'true' }).otelSdkDisabled).toBe(true)
	})

	it('defaults LOG_LEVEL and LOG_MODE', () => {
		const config = parseEnvConfig(base())

		expect(config.logLevel).toBe('info')
		expect(config.logMode).toBe('stdout')
	})

	it('passes through valid LOG_LEVEL and LOG_MODE values', () => {
		const config = parseEnvConfig({
			...base(),
			LOG_LEVEL: 'debug',
			LOG_MODE: 'otlp',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
		})

		expect(config.logLevel).toBe('debug')
		expect(config.logMode).toBe('otlp')
	})

	it('rejects invalid LOG_LEVEL and LOG_MODE values', () => {
		expect(() => parseEnvConfig({ ...base(), LOG_LEVEL: 'loud' })).toThrow(
			/LOG_LEVEL must be one of/,
		)
		expect(() => parseEnvConfig({ ...base(), LOG_MODE: 'file' })).toThrow(/LOG_MODE must be one of/)
	})

	it('rejects otlp/both LOG_MODE without an OTLP endpoint', () => {
		expect(() => parseEnvConfig({ ...base(), LOG_MODE: 'both' })).toThrow(/LOG_MODE must be one of/)
	})
})
