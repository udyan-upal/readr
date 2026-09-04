import { trace } from '@opentelemetry/api'
import pino from 'pino'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogMode = 'stdout' | 'otlp' | 'both'

export interface LoggerConfig {
	/** Must equal the telemetry service.name so Grafana joins Loki <-> Tempo. */
	serviceName: string
	level: LogLevel
	/** stdout = plain pino (prod k8s: node agent tails); otlp/both ship to the collector. */
	mode: LogMode
	/** OTLP HTTP base endpoint (e.g. http://localhost:4318). Required for otlp/both. */
	otlpEndpoint?: string
}

/** Structured logger; close() flushes the transport before process exit. */
export interface Logger {
	debug(msg: string, ctx?: Record<string, unknown>): void
	info(msg: string, ctx?: Record<string, unknown>): void
	warn(msg: string, ctx?: Record<string, unknown>): void
	error(msg: string, err?: unknown, ctx?: Record<string, unknown>): void
	close(): Promise<void>
}

const DEFAULT_REDACT = [
	'password',
	'*.password',
	'secret',
	'*.secret',
	'token',
	'*.token',
	'accessToken',
	'*.accessToken',
	'authorization',
	'*.authorization',
]

/** Stamps the active span onto every record — the Loki <-> Tempo join key. */
function traceMixin(): Record<string, string> {
	const span = trace.getActiveSpan()
	if (!span) return {}
	const { traceId, spanId, traceFlags } = span.spanContext()
	// The OTLP transport only picks the context up when all three W3C fields
	// are present (trace_flags included), else correlation is dropped.
	return { trace_id: traceId, span_id: spanId, trace_flags: `0${traceFlags.toString(16)}` }
}

/**
 * Builds a pino-based Logger. Throws for otlp/both modes without an endpoint.
 * Worker transports run off-thread, so logging never blocks the event loop.
 */
export function createLogger(config: LoggerConfig): Logger {
	if (config.mode !== 'stdout' && !config.otlpEndpoint) {
		throw new Error(`LOG_MODE=${config.mode} requires OTEL_EXPORTER_OTLP_ENDPOINT to be set`)
	}

	const otelTarget: pino.TransportTargetOptions = {
		target: 'pino-opentelemetry-transport',
		options: {
			resourceAttributes: { 'service.name': config.serviceName },
			collectors: [`${config.otlpEndpoint}/v1/logs`],
		},
	}
	// A created transport is a stream — pino only accepts stream OPTIONS in
	// LoggerOptions.transport, so hand the instance over as the destination.
	const transport =
		config.mode === 'otlp'
			? pino.transport(otelTarget)
			: config.mode === 'both'
				? pino.transport({
						targets: [otelTarget, { target: 'pino/file', options: { destination: 1 } }],
					})
				: undefined

	const options: pino.LoggerOptions = {
		level: config.level,
		base: { service: config.serviceName },
		mixin: traceMixin,
		redact: { paths: DEFAULT_REDACT, censor: '[redacted]' },
		serializers: { err: pino.stdSerializers.err },
	}
	const instance = transport ? pino(options, transport) : pino(options)

	const logger: Logger = {
		debug: (msg, ctx) => instance.debug(ctx ?? {}, msg),
		info: (msg, ctx) => instance.info(ctx ?? {}, msg),
		warn: (msg, ctx) => instance.warn(ctx ?? {}, msg),
		error: (msg, err, ctx) => instance.error({ err, ...ctx }, msg),
		close: () =>
			new Promise<void>((resolve) => {
				// A dead collector must never block exit; the caller races a timeout.
				if (!transport) return resolve()
				;(transport as { end: (cb?: () => void) => void }).end(() => resolve())
			}),
	}

	return logger
}
