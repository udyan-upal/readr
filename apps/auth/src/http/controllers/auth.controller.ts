import type { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AuthService } from '@/auth/auth.service'
import type { EnvConfig } from '@/config/env.config'
import { TOKENS } from '@/core/tokens'
import { AbstractController } from '@/utils/abstracts'
import { inject, injectable } from '@/utils/decorators'

@injectable()
export class AuthController extends AbstractController {
	constructor(
		@inject(TOKENS.AuthService) private readonly authService: AuthService,
		@inject(TOKENS.Config) private readonly config: EnvConfig,
	) {
		super()
	}

	register(app: Hono): void {
		app.use(
			'/api/auth/*',
			cors({
				origin: this.config.webOrigin,
				allowHeaders: ['content-type', 'authorization'],
				// Non-safelisted response headers are invisible to fetch() unless
				// named here — without this the browser reads no token on sign-in.
				exposeHeaders: ['set-auth-token', 'set-auth-jwt'],
			}),
		)
		app.all('/api/auth/*', async (c) => {
			const res = await this.authService.handle(c.req.raw)
			// Stateless bearer-only API: never set cookies. The token headers
			// (set-auth-token, set-auth-jwt) are unaffected.
			res.headers.delete('set-cookie')
			return res
		})
	}
}
