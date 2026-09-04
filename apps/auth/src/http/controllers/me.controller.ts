import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { BearerMiddleware } from '@/core/bearer-middleware'
import { TOKENS } from '@/core/tokens'
import { AbstractController } from '@/utils/abstracts'
import { inject, injectable } from '@/utils/decorators'

@injectable()
export class MeController extends AbstractController {
	constructor(@inject(TOKENS.BearerMiddleware) private readonly bearer: BearerMiddleware) {
		super()
	}

	register(app: Hono): void {
		// Chain off .use so the /api/me handler sees the BearerEnv typing.
		app.use('/api/me', this.bearer.handler).get('/api/me', (c) => {
			const claims = c.get('claims')
			if (!claims) {
				throw new HTTPException(401)
			}
			return c.json({ id: claims.sub, email: claims.email, name: claims.name })
		})
	}
}
