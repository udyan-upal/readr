import 'reflect-metadata'
import { NOOP_TELEMETRY, startTelemetry, type Telemetry } from '@boilerplate/telemetry'
import { loadEnvConfig } from '@/config/env.config'

// Telemetry must start BEFORE app modules import node:http — hence the
// dynamic import of @/app after sdk.start(). A static import here would be
// hoisted ahead of the SDK (and re-sorted by Biome), silently losing spans.
const config = loadEnvConfig()
const telemetry: Telemetry =
	config.otlpEndpoint && !config.otelSdkDisabled
		? startTelemetry({ endpoint: config.otlpEndpoint, serviceName: config.otelServiceName })
		: NOOP_TELEMETRY

const { Application } = await import('@/app')
await Application.create(config, telemetry).start()
