import { Hono } from 'hono'
import type { HttpApp as HttpAppContract } from '@/core/http-app'
import { TOKENS } from '@/core/tokens'
import type { AbstractController } from '@/utils/abstracts'
import { injectable, multiInject } from '@/utils/decorators'

/** Assembles the Hono app by letting every controller register onto it. */
@injectable()
export class HttpApp implements HttpAppContract {
	readonly hono: Hono

	constructor(@multiInject(TOKENS.Controller) controllers: AbstractController[]) {
		this.hono = new Hono()
		for (const controller of controllers) {
			controller.register(this.hono)
		}
	}

	get fetch(): Hono['fetch'] {
		return this.hono.fetch
	}
}
