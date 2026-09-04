import { createMiddleware } from 'hono/factory'
import type { EnvConfig } from '@/config/env.config'
import type {
	BearerEnv,
	BearerMiddleware as BearerMiddlewareContract,
	BearerMiddlewareHandler,
} from '@/core/bearer-middleware'
import type { Claims } from '@/core/schemas'
import type { TokenService } from '@/core/token-service'
import { TOKENS } from '@/core/tokens'
import { inject, injectable } from '@/utils/decorators'

/**
 * Verifies the `Authorization: Bearer <JWE>` header statelessly — decrypt and
 * validate exp/iss/aud against the shared key. No session or database lookup.
 */
@injectable()
export class BearerMiddleware implements BearerMiddlewareContract {
	constructor(
		@inject(TOKENS.TokenService) private readonly tokenService: TokenService,
		@inject(TOKENS.Config) private readonly config: EnvConfig,
	) {}

	readonly handler: BearerMiddlewareHandler = createMiddleware<BearerEnv>(async (c, next) => {
		const header = c.req.header('Authorization')
		const token = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
		let claims: Claims | null = null
		if (token) {
			try {
				claims = await this.tokenService.verify(token, {
					issuer: this.config.betterAuthUrl,
					audience: this.config.betterAuthUrl,
				})
			} catch {
				claims = null
			}
		}
		c.set('claims', claims)
		await next()
	})
}
