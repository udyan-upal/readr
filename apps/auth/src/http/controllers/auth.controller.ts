import type { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AuthService } from '@/auth/auth.service'
import { TOKENS } from '@/core/tokens'
import { AbstractController } from '@/utils/abstracts'
import { inject, injectable } from '@/utils/decorators'

@injectable()
export class AuthController extends AbstractController {
	constructor(@inject(TOKENS.AuthService) private readonly authService: AuthService) {
		super()
	}

	register(app: Hono): void {
		app.use('/api/auth/*', cors())
		app.all('/api/auth/*', async (c) => {
			const res = await this.authService.handle(c.req.raw)
			// Stateless bearer-only API: never set cookies. The token headers
			// (set-auth-token, set-auth-jwt) are unaffected.
			res.headers.delete('set-cookie')
			return res
		})
	}
}
