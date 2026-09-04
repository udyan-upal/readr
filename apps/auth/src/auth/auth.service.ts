import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import type { Logger } from '@boilerplate/logger'
import { betterAuth } from 'better-auth'
import { bearer, jwt } from 'better-auth/plugins'
import type { EnvConfig } from '@/config/env.config'
import type { AuthService as AuthServiceContract } from '@/core/auth-service'
import type { Database } from '@/core/database'
import type { TokenService } from '@/core/token-service'
import { TOKENS } from '@/core/tokens'
import * as schema from '@/db/schemas/index'
import { inject, injectable } from '@/utils/decorators'

/** Facade over the configured Better Auth instance. */
@injectable()
export class AuthService implements AuthServiceContract {
	// Un-annotated on purpose: the betterAuth() return type is a large
	// inferred generic; annotating it as ReturnType<typeof betterAuth>
	// widens the generic and breaks plugin typing.
	private readonly instance

	constructor(
		@inject(TOKENS.Database) database: Database,
		@inject(TOKENS.TokenService) private readonly tokenService: TokenService,
		@inject(TOKENS.Config) config: EnvConfig,
		@inject(TOKENS.Logger) private readonly logger: Logger,
	) {
		this.instance = betterAuth({
			database: drizzleAdapter(database.db, { provider: 'sqlite', schema }),
			secret: config.betterAuthSecret,
			baseURL: config.betterAuthUrl,
			emailAndPassword: { enabled: true },
			logger: {
				// better-auth's default level is 'warn', so only warn/error reach log()
				log: (level, message) => {
					if (level === 'warn') this.logger.warn(message)
					else if (level === 'error') this.logger.error(message)
				},
			},
			plugins: [
				passkey(),
				jwt({
					// remoteUrl is required by the plugin when jwt.sign is set. It disables
					// the local /jwks endpoint (404) and is never fetched: JWE tokens use
					// the shared symmetric key instead of a public/private key pair.
					jwks: {
						remoteUrl: `${config.betterAuthUrl}/.well-known/jwks.json`,
						keyPairConfig: { alg: 'EdDSA' },
					},
					jwt: { sign: (payload) => this.tokenService.sign(payload) },
				}),
				bearer(),
			],
		})
	}

	handle(request: Request): Promise<Response> {
		return this.instance.handler(request)
	}
}
