/** Serves the HTTP app and owns graceful shutdown. */
export interface HttpServer {
	start(): void
	stop(onStopped: () => void): void
}
