import type { MiddlewareHandler } from 'hono'
import type { Claims } from '@/core/schemas'

export type BearerEnv = { Variables: { claims: Claims | null } }
export type BearerMiddlewareHandler = MiddlewareHandler<BearerEnv>

/** Verifies the `Authorization: Bearer <JWE>` header statelessly and exposes claims. */
export interface BearerMiddleware {
	readonly handler: BearerMiddlewareHandler
}
