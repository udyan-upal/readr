import { createLogger } from '@boilerplate/logger'
import { Container } from 'inversify'
import { AuthService } from '@/auth/auth.service'
import { JweTokenService } from '@/auth/jwe-token.service'
import type { EnvConfig } from '@/config/env.config'
import { TOKENS } from '@/core/tokens'
import { Database } from '@/db/database'
import { Migrator } from '@/db/migrator'
import { AuthController } from '@/http/controllers/auth.controller'
import { HealthController } from '@/http/controllers/health.controller'
import { MeController } from '@/http/controllers/me.controller'
import { HttpApp } from '@/http/http-app'
import { BearerMiddleware } from '@/http/middleware/bearer.middleware'
import { HttpServer } from '@/server'

/**
 * The app's IoC container: binds every service for one environment.
 * Shared by prod (Application.create) and tests (testing/test-app.ts) —
 * environments differ only through the EnvConfig constant.
 *
 * Classes decorated with `@injectable()` bind via `.to(Class)`; the few
 * with primitive constructor args (Database path, JweTokenService key)
 * bind via dynamic values built from the config constant.
 */
export class AuthContainer extends Container {
	constructor(config: EnvConfig) {
		super()
		this.bind(TOKENS.Config).toConstantValue(config)
		this.bind(TOKENS.Logger)
			.toDynamicValue((ctx) => {
				const c = ctx.get<EnvConfig>(TOKENS.Config)
				return createLogger({
					serviceName: c.otelServiceName,
					level: c.logLevel,
					mode: c.logMode,
					...(c.otlpEndpoint ? { otlpEndpoint: c.otlpEndpoint } : {}),
				})
			})
			.inSingletonScope()
		this.bind(TOKENS.Database)
			.toDynamicValue((ctx) => {
				const c = ctx.get<EnvConfig>(TOKENS.Config)
				return new Database(c.databaseUrl, c.databaseAuthToken)
			})
			.inSingletonScope()
		this.bind(TOKENS.TokenService)
			.toDynamicValue(
				(ctx) => new JweTokenService(ctx.get<EnvConfig>(TOKENS.Config).jwtEncryptionKey),
			)
			.inSingletonScope()
		this.bind(TOKENS.Migrator).to(Migrator).inSingletonScope()
		this.bind(TOKENS.AuthService).to(AuthService).inSingletonScope()
		this.bind(TOKENS.BearerMiddleware).to(BearerMiddleware).inSingletonScope()
		this.bind(TOKENS.Controller).to(HealthController).inSingletonScope()
		this.bind(TOKENS.Controller).to(AuthController).inSingletonScope()
		this.bind(TOKENS.Controller).to(MeController).inSingletonScope()
		this.bind(TOKENS.HttpApp).to(HttpApp).inSingletonScope()
		this.bind(TOKENS.HttpServer).to(HttpServer).inSingletonScope()
	}
}
