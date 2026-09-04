import type { Logger } from '@boilerplate/logger'
import { serve } from '@hono/node-server'
import type { EnvConfig } from '@/config/env.config'
import type { HttpApp } from '@/core/http-app'
import type { HttpServer as HttpServerContract } from '@/core/http-server'
import { TOKENS } from '@/core/tokens'
import { inject, injectable } from '@/utils/decorators'

type NodeServer = ReturnType<typeof serve>

@injectable()
export class HttpServer implements HttpServerContract {
	private server: NodeServer | undefined

	constructor(
		@inject(TOKENS.HttpApp) private readonly app: HttpApp,
		@inject(TOKENS.Config) private readonly config: EnvConfig,
		@inject(TOKENS.Logger) private readonly logger: Logger,
	) {}

	start(): void {
		this.server = serve({ fetch: this.app.fetch, port: this.config.port }, () => {
			this.logger.info('auth listening', { port: this.config.port })
		})
	}

	stop(onStopped: () => void): void {
		this.server?.close(() => onStopped())
	}
}
