import type { Hono } from 'hono'

/** Assembles the Hono app by letting every controller register onto it. */
export interface HttpApp {
	readonly hono: Hono
	readonly fetch: Hono['fetch']
}
