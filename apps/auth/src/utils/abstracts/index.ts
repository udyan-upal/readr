import type { Hono } from 'hono'
import { decorate, injectable } from '@/utils/decorators'

/**
 * Base class for route controllers. Subclasses register their routes
 * onto the shared Hono app; the composition root injects every controller
 * into {@link ../../http/http-app.ts} (HttpApp).
 */
export abstract class AbstractController {
	/** Registers this controller's routes onto the app in place. */
	abstract register(app: Hono): void
}

// Inversify requires injectable metadata on base classes too.
decorate(injectable(), AbstractController)
