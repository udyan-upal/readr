import type { TtsChunk } from '@/lib/ttsChunks'

/**
 * Bounded look-ahead buffer: current clip plus two ahead, at most two fetches
 * in flight. Ported from the extension reader (`tts-buffer.mjs`).
 */
export class TtsBuffer<T> {
	private entries = new Map<
		number,
		{
			promise: Promise<void>
			resolve: () => void
			controller: AbortController
			started: boolean
			clip?: T
			error?: unknown
		}
	>()
	private active = 0
	private closed = false

	constructor(
		private chunks: TtsChunk[],
		private fetchClip: (chunk: TtsChunk, signal: AbortSignal) => Promise<T>,
		private releaseClip: (clip: T | null) => void,
	) {}

	fill(index: number): void {
		if (this.closed) return
		for (let i = index; i <= index + 2 && i < this.chunks.length; i++) {
			if (this.entries.has(i)) continue
			let resolve = () => {}
			const promise = new Promise<void>((done) => {
				resolve = done
			})
			this.entries.set(i, { promise, resolve, controller: new AbortController(), started: false })
		}
		this.pump()
	}

	private pump(): void {
		if (this.closed) return
		for (const [index, entry] of this.entries) {
			if (this.active >= 2) break
			if (entry.started) continue
			entry.started = true
			this.active++
			Promise.resolve()
				.then(() => {
					if (this.closed) return null
					return this.fetchClip(this.chunks[index], entry.controller.signal)
				})
				.then((clip) => {
					if (this.closed) this.releaseClip(clip)
					else if (clip) entry.clip = clip
				})
				.catch((error: unknown) => {
					entry.error = error
				})
				.finally(() => {
					this.active--
					entry.resolve()
					this.pump()
				})
		}
	}

	async take(index: number): Promise<T | null> {
		this.fill(index)
		const entry = this.entries.get(index)
		if (!entry) return null
		await entry.promise
		if (this.closed) return null
		this.entries.delete(index)
		if (entry.error) throw entry.error
		const clip = entry.clip
		entry.clip = undefined
		return clip ?? null
	}

	close(): void {
		this.closed = true
		for (const entry of this.entries.values()) {
			entry.controller.abort()
			this.releaseClip(entry.clip ?? null)
			entry.clip = undefined
			entry.resolve()
		}
		this.entries.clear()
	}
}
