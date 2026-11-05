import { getCloudflareContext } from '@opennextjs/cloudflare'

/** Minimal shapes for the Cloudflare bindings this app uses (see wrangler.jsonc). */
interface D1Result<T> {
	results: T[]
}
interface D1Statement {
	bind(...values: unknown[]): D1Statement
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>
	first<T = Record<string, unknown>>(): Promise<T | null>
	run(): Promise<unknown>
}
interface R2ObjectMeta {
	key: string
	uploaded: Date
}
interface R2ObjectBody extends R2ObjectMeta {
	body: ReadableStream
	size: number
}
interface R2Bucket {
	put(
		key: string,
		value: ArrayBuffer,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>
	get(key: string): Promise<R2ObjectBody | null>
	delete(key: string | string[]): Promise<void>
	list(options: { prefix: string; cursor?: string }): Promise<{
		objects: R2ObjectMeta[]
		truncated: boolean
		cursor?: string
	}>
}

export interface AppBindings {
	DB: { prepare(sql: string): D1Statement }
	BUCKET: R2Bucket
}

export const bindings = (): AppBindings => getCloudflareContext().env as unknown as AppBindings
