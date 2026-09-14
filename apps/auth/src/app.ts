import { setTimeout as sleep } from 'node:timers/promises'
import type { Logger } from '@boilerplate/logger'
import type { Telemetry } from '@boilerplate/telemetry'
import type { EnvConfig } from '@/config/env.config'
import type { Database } from '@/core/database'
import type { HttpServer } from '@/core/http-server'
import type { Migrator } from '@/core/migrator'
import { TOKENS } from '@/core/tokens'
import { AuthContainer } from '@/utils/containers'

/** Wires the container, runs migrations, serves HTTP, and owns shutdown. */
export class Application {
	static create(config: EnvConfig, telemetry: Telemetry) {
		return new Application(new AuthContainer(config), telemetry)
	}

	private constructor(
		private readonly container: AuthContainer,
		private readonly telemetry: Telemetry,
	) {}

	async start(): Promise<void> {
		await this.container.get<Migrator>(TOKENS.Migrator).run()
		this.container.get<HttpServer>(TOKENS.HttpServer).start()
		process.on('SIGINT', () => this.stop())
		process.on('SIGTERM', () => this.stop())
	}

	stop(): void {
		const server = this.container.get<HttpServer>(TOKENS.HttpServer)
		const database = this.container.get<Database>(TOKENS.Database)
		const logger = this.container.get<Logger>(TOKENS.Logger)
		server.stop(() => {
			database.close()
			// Flush OTLP exports and the log transport, but never let a dead
			// collector block exit.
			const flush = Promise.all([this.telemetry.shutdown(), logger.close()])
			void Promise.race([flush, sleep(2000)]).finally(() => process.exit(0))
		})
	}
}
