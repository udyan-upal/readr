'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { alignBoundaries } from '@/lib/alignBoundaries'
import { apiFetch } from '@/lib/api-fetch'
import { TtsBuffer } from '@/lib/ttsBuffer'
import { buildProgressiveChunks, type TtsChunk } from '@/lib/ttsChunks'
import type { TtsResponse, Word, WordBoundary } from '@/types'

interface PlayOptions {
	text: string
	voice: string
	rate: string
	words: Word[]
	startWordIndex?: number
	onActivated?: () => void
}

interface Clip {
	url: string
	audio: HTMLAudioElement
	boundaries: WordBoundary[]
}

interface QueuedPage {
	key: string
	opts: PlayOptions
	chunks: TtsChunk[]
	clip: Clip
}

interface ActiveChunk extends Clip {
	chunk: TtsChunk
	aligned: Word[]
}

interface State {
	isPlaying: boolean
	isLoading: boolean
	currentWordIndex: number
	progress: number
	error: string | null
	alignedWords: Word[]
	endedCount: number
	gaplessEndedCount: number
}

function keyOf(o: PlayOptions): string {
	return `${o.voice}|${o.startWordIndex ?? 0}|${o.words.length}|${o.text.length}|${o.text.slice(0, 48)}|${o.text.slice(-48)}`
}

function rateToPlaybackRate(rate: string): number {
	const percent = Number.parseInt(rate.replace('%', ''), 10)
	if (Number.isNaN(percent)) return 1
	return Math.max(0.25, Math.min(4, 1 + percent / 100))
}

function releaseClip(clip: Clip | null): void {
	if (!clip) return
	clip.audio.pause()
	clip.audio.removeAttribute('src')
	clip.audio.load()
	URL.revokeObjectURL(clip.url)
}

function wordIndexAt(aligned: Word[], chunk: TtsChunk, ms: number): number {
	let local = 0
	for (let i = 0; i < aligned.length; i++) {
		const off = aligned[i].offsetMs
		if (off === undefined) continue
		if (off <= ms) local = i
		else break
	}
	return Math.min(chunk.wordEnd, chunk.wordStart + local)
}

/**
 * Chunked TTS playback. Mirrors the extension reader: progressive clips
 * (100 → 500 → 1000 → 1500 chars), two fetches in flight, and the next page's
 * first clip prefetched into a standby clip for gapless page changes.
 */
export function useTtsPlayer() {
	const sessionRef = useRef(0)
	const playbackRateRef = useRef(1)

	const optsRef = useRef<PlayOptions | null>(null)
	const chunksRef = useRef<TtsChunk[]>([])
	const chunkIndexRef = useRef(0)
	const bufferRef = useRef<TtsBuffer<Clip> | null>(null)
	const activeRef = useRef<ActiveChunk | null>(null)
	const queuedPageRef = useRef<QueuedPage | null>(null)
	const prefetchingRef = useRef<{ key: string; controller: AbortController } | null>(null)
	const lastReqRef = useRef<PlayOptions | null>(null)
	const advanceRef = useRef<() => Promise<void>>(async () => {})
	const playRef = useRef<(opts: PlayOptions) => Promise<void>>(async () => {})

	const [state, setState] = useState<State>({
		isPlaying: false,
		isLoading: false,
		currentWordIndex: -1,
		progress: 0,
		error: null,
		alignedWords: [],
		endedCount: 0,
		gaplessEndedCount: 0,
	})

	const fetchClip = useCallback(
		async (chunk: TtsChunk, voice: string, signal?: AbortSignal): Promise<Clip> => {
			const res = await apiFetch('/api/tts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: chunk.text, voice, rate: '+0%' }),
				signal,
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string }
				throw new Error(data.error ?? `HTTP ${res.status}`)
			}
			const data = (await res.json()) as TtsResponse
			signal?.throwIfAborted()

			const bin = atob(data.audio)
			const bytes = new Uint8Array(bin.length)
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
			const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))

			const audio = new Audio()
			audio.preload = 'auto'
			audio.src = url
			audio.playbackRate = playbackRateRef.current
			audio.load()
			return { url, audio, boundaries: Array.isArray(data.boundaries) ? data.boundaries : [] }
		},
		[],
	)

	const releaseActive = useCallback(() => {
		const active = activeRef.current
		if (!active) return
		active.audio.onended = null
		active.audio.ontimeupdate = null
		active.audio.onerror = null
		active.audio.onplay = null
		active.audio.onpause = null
		releaseClip(active)
		activeRef.current = null
	}, [])

	const releaseQueued = useCallback(() => {
		const queued = queuedPageRef.current
		queuedPageRef.current = null
		if (queued) releaseClip(queued.clip)
	}, [])

	const closeBuffer = useCallback(() => {
		bufferRef.current?.close()
		bufferRef.current = null
	}, [])

	const progressAt = useCallback((wordIndex: number): number => {
		const opts = optsRef.current
		if (!opts) return 0
		const start = opts.startWordIndex ?? 0
		const total = Math.max(1, opts.words.length - 1 - start)
		return Math.min(1, Math.max(0, (wordIndex - start) / total))
	}, [])

	const activateChunk = useCallback(
		(clip: Clip, index: number) => {
			const opts = optsRef.current
			const chunk = chunksRef.current[index]
			if (!opts || !chunk) {
				releaseClip(clip)
				return
			}

			chunkIndexRef.current = index
			const aligned = alignBoundaries(
				opts.words.slice(chunk.wordStart, chunk.wordEnd + 1),
				clip.boundaries,
			)
			const session = sessionRef.current
			activeRef.current = { ...clip, chunk, aligned }

			const audio = clip.audio
			audio.playbackRate = playbackRateRef.current

			audio.onplay = () => {
				if (session !== sessionRef.current) return
				setState((s) => (s.isPlaying ? s : { ...s, isPlaying: true }))
			}

			audio.onpause = () => {
				if (session !== sessionRef.current) return
				setState((s) => (s.isPlaying ? { ...s, isPlaying: false } : s))
			}

			audio.ontimeupdate = () => {
				if (session !== sessionRef.current) return
				const idx = wordIndexAt(aligned, chunk, audio.currentTime * 1000)
				setState((s) =>
					s.currentWordIndex === idx
						? s
						: { ...s, currentWordIndex: idx, progress: progressAt(idx) },
				)
			}

			audio.onended = () => {
				if (session !== sessionRef.current) return
				audio.ontimeupdate = null
				audio.onended = null
				void advanceRef.current()
			}

			audio.onerror = () => {
				if (session !== sessionRef.current) return
				closeBuffer()
				releaseActive()
				setState((s) => ({
					...s,
					isPlaying: false,
					isLoading: false,
					error: 'Could not play Edge TTS audio.',
				}))
			}

			setState((s) => ({
				...s,
				isLoading: false,
				isPlaying: false,
				currentWordIndex: chunk.wordStart,
				progress: progressAt(chunk.wordStart),
				error: null,
				alignedWords: opts.words,
			}))

			audio.play().catch((err: Error) => {
				if (session !== sessionRef.current) return
				setState((s) => ({ ...s, isPlaying: false, error: err.message }))
			})
		},
		[closeBuffer, progressAt, releaseActive],
	)

	const startQueuedPage = useCallback(
		(queued: QueuedPage) => {
			releaseActive()
			closeBuffer()

			optsRef.current = queued.opts
			chunksRef.current = queued.chunks
			chunkIndexRef.current = 0
			queued.opts.onActivated?.()

			const buffer = new TtsBuffer<Clip>(
				queued.chunks,
				(chunk, signal) => fetchClip(chunk, queued.opts.voice, signal),
				releaseClip,
			)
			bufferRef.current = buffer
			buffer.fill(1)

			activateChunk(queued.clip, 0)
		},
		[activateChunk, closeBuffer, fetchClip, releaseActive],
	)

	const advance = useCallback(async () => {
		const session = sessionRef.current
		const opts = optsRef.current
		if (!opts) return

		const nextIndex = chunkIndexRef.current + 1
		if (nextIndex < chunksRef.current.length) {
			try {
				const clip = await bufferRef.current?.take(nextIndex)
				if (session !== sessionRef.current) {
					releaseClip(clip ?? null)
					return
				}
				if (!clip) return
				releaseActive()
				activateChunk(clip, nextIndex)
			} catch (err) {
				if (session !== sessionRef.current) return
				closeBuffer()
				releaseActive()
				setState((s) => ({
					...s,
					isPlaying: false,
					isLoading: false,
					error: (err as Error).message,
				}))
			}
			return
		}

		// Page finished. If the next page's first clip is ready, swap gaplessly;
		// otherwise let the page layer ask for the next page.
		const queued = queuedPageRef.current
		if (queued && queued.opts.voice === opts.voice) {
			queuedPageRef.current = null
			setState((s) => ({
				...s,
				isPlaying: false,
				progress: 1,
				endedCount: s.endedCount + 1,
				gaplessEndedCount: s.gaplessEndedCount + 1,
			}))
			startQueuedPage(queued)
			return
		}

		setState((s) => ({ ...s, isPlaying: false, progress: 1, endedCount: s.endedCount + 1 }))
	}, [activateChunk, closeBuffer, releaseActive, startQueuedPage])

	useEffect(() => {
		advanceRef.current = advance
	}, [advance])

	const stop = useCallback(() => {
		sessionRef.current++
		prefetchingRef.current?.controller.abort()
		prefetchingRef.current = null
		closeBuffer()
		releaseActive()
		releaseQueued()
		optsRef.current = null
		chunksRef.current = []
		chunkIndexRef.current = 0
		setState((s) => ({
			...s,
			isPlaying: false,
			isLoading: false,
			currentWordIndex: -1,
			progress: 0,
			alignedWords: [],
		}))
	}, [closeBuffer, releaseActive, releaseQueued])

	const pause = useCallback(() => {
		activeRef.current?.audio.pause()
	}, [])

	const resume = useCallback(() => {
		const audio = activeRef.current?.audio
		if (audio) {
			void audio.play().catch(() => {})
			return
		}
		if (lastReqRef.current) {
			const opts = lastReqRef.current
			const start = Math.max(0, state.currentWordIndex)
			void (start > 0 ? playRef.current({ ...opts, startWordIndex: start }) : playRef.current(opts))
		}
	}, [state.currentWordIndex])

	const play = useCallback(
		async (opts: PlayOptions) => {
			lastReqRef.current = opts
			const session = ++sessionRef.current
			prefetchingRef.current?.controller.abort()
			prefetchingRef.current = null
			closeBuffer()
			releaseActive()

			const key = keyOf(opts)
			const chunks = buildProgressiveChunks(opts.words, opts.startWordIndex ?? 0)
			if (!chunks.length) {
				setState((s) => ({ ...s, isLoading: false, isPlaying: false }))
				return
			}

			optsRef.current = opts
			chunksRef.current = chunks
			chunkIndexRef.current = 0

			const buffer = new TtsBuffer<Clip>(
				chunks,
				(chunk, signal) => fetchClip(chunk, opts.voice, signal),
				releaseClip,
			)
			bufferRef.current = buffer

			let first: Clip | null = null
			const queued = queuedPageRef.current
			if (queued?.key === key) {
				queuedPageRef.current = null
				first = queued.clip
				buffer.fill(1)
			}

			setState((s) => ({
				...s,
				isLoading: first === null,
				isPlaying: false,
				currentWordIndex: -1,
				progress: 0,
				error: null,
				alignedWords: [],
			}))

			try {
				if (!first) {
					// Warm the buffer before awaiting so clip 2 starts fetching in parallel.
					buffer.fill(0)
					first = await buffer.take(0)
				}
				if (session !== sessionRef.current) {
					releaseClip(first)
					return
				}
				if (!first) return
				activateChunk(first, 0)
			} catch (err) {
				if (session !== sessionRef.current) return
				closeBuffer()
				setState((s) => ({
					...s,
					isLoading: false,
					isPlaying: false,
					error: (err as Error).message,
				}))
			}
		},
		[activateChunk, closeBuffer, fetchClip, releaseActive],
	)

	useEffect(() => {
		playRef.current = play
	}, [play])

	/** Fetch only the next page's tiny first clip; playback starts instantly on swap. */
	const prefetch = useCallback(
		async (opts: PlayOptions) => {
			const key = keyOf(opts)
			if (queuedPageRef.current?.key === key) return
			if (prefetchingRef.current?.key === key) return

			const chunks = buildProgressiveChunks(opts.words, 0)
			if (!chunks.length) return

			prefetchingRef.current?.controller.abort()
			const controller = new AbortController()
			prefetchingRef.current = { key, controller }

			try {
				const clip = await fetchClip(chunks[0], opts.voice, controller.signal)
				if (prefetchingRef.current?.controller !== controller) {
					releaseClip(clip)
					return
				}
				prefetchingRef.current = null
				releaseQueued()
				queuedPageRef.current = { key, opts, chunks, clip }
			} catch {
				if (prefetchingRef.current?.controller === controller) prefetchingRef.current = null
			}
		},
		[fetchClip, releaseQueued],
	)

	const updateWords = useCallback((words: Word[]) => {
		const opts = optsRef.current
		const active = activeRef.current
		if (!opts || !active) return
		optsRef.current = { ...opts, words }
		active.aligned = alignBoundaries(
			words.slice(active.chunk.wordStart, active.chunk.wordEnd + 1),
			active.boundaries,
		)
		setState((s) => ({ ...s, alignedWords: words }))
	}, [])

	const setPlaybackRate = useCallback((rate: string) => {
		const next = rateToPlaybackRate(rate)
		playbackRateRef.current = next
		if (activeRef.current) activeRef.current.audio.playbackRate = next
	}, [])

	const retry = useCallback(() => {
		if (lastReqRef.current) void play(lastReqRef.current)
	}, [play])

	useEffect(
		() => () => {
			sessionRef.current++
			prefetchingRef.current?.controller.abort()
			bufferRef.current?.close()
			const active = activeRef.current
			if (active) releaseClip(active)
			const queued = queuedPageRef.current
			if (queued) releaseClip(queued.clip)
		},
		[],
	)

	return {
		...state,
		play,
		prefetch,
		updateWords,
		pause,
		resume,
		stop,
		retry,
		setPlaybackRate,
	}
}
