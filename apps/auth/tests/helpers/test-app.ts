import 'reflect-metadata'
import type { JweTokenService } from '@/auth/jwe-token.service'
import { parseEnvConfig } from '@/config/env.config'
import type { AuthService } from '@/core/auth-service'
import type { Database } from '@/core/database'
import type { HttpApp } from '@/core/http-app'
import type { Migrator } from '@/core/migrator'
import type { TokenService } from '@/core/token-service'
import { TOKENS } from '@/core/tokens'
import { AuthContainer } from '@/utils/containers'

export const TEST_BASE_URL = 'http://auth.test'
const TEST_SECRET = 'test-secret-that-is-at-least-32-chars!'
// Fixed 32-byte key so tests can mint/decrypt tokens directly with jose.
export const TEST_JWT_KEY = new Uint8Array(32).map((_, i) => i + 1)

export function createTestApp() {
	const config = parseEnvConfig({
		BETTER_AUTH_SECRET: TEST_SECRET,
		BETTER_AUTH_URL: TEST_BASE_URL,
		JWT_ENCRYPTION_KEY: Buffer.from(TEST_JWT_KEY).toString('base64'),
		DATABASE_PATH: ':memory:',
		PORT: '3000',
		// Expected-warn e2e cases (wrong password, etc.) otherwise print via the
		// better-auth -> pino bridge.
		LOG_LEVEL: 'error',
	})
	const container = new AuthContainer(config)
	container.get<Migrator>(TOKENS.Migrator).run()

	const app = container.get<HttpApp>(TOKENS.HttpApp).hono
	const auth = container.get<AuthService>(TOKENS.AuthService)
	const jwe: TokenService = container.get<JweTokenService>(TOKENS.TokenService)
	const sqlite = container.get<Database>(TOKENS.Database).sqlite

	return { app, auth, jwe, baseUrl: TEST_BASE_URL, sqlite }
}
