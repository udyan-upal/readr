import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

export interface TelemetryConfig {
	/** OTLP HTTP base endpoint, e.g. http://localhost:4318 (no /v1/* suffix). */
	endpoint: string
	serviceName: string
}

/** Started telemetry; shutdown flushes pending exports. */
export interface Telemetry {
	shutdown(): Promise<void>
}

/** Stand-in for environments with telemetry disabled (tests, default dev). */
export const NOOP_TELEMETRY: Telemetry = {
	shutdown: () => Promise.resolve(),
}

/**
 * Starts OTLP export for the current process. MUST run before app modules
 * load — instrumentation registers module hooks that only affect imports
 * that happen after sdk.start().
 */
export function startTelemetry(config: TelemetryConfig): Telemetry {
	const sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: config.serviceName,
		}),
		traceExporter: new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` }),
		metricReaders: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({ url: `${config.endpoint}/v1/metrics` }),
				// 5s not the OTel 60s default — local dashboards update fast.
				exportIntervalMillis: 5000,
			}),
		],
		instrumentations: [
			new HttpInstrumentation(),
			new UndiciInstrumentation(),
			new RuntimeNodeInstrumentation(),
		],
	})
	sdk.start()
	return {
		// A dead collector must never block process exit.
		shutdown: () => sdk.shutdown().catch(() => undefined),
	}
}
