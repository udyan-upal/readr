'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { alignBoundaries } from '@/lib/alignBoundaries'
import { apiFetch } from '@/lib/api-fetch'
import type { TtsResponse, Word, WordBoundary } from '@/types'

interface PlayOptions {
	text: string
	voice: string
	rate: string
	words: Word[]
	startWordIndex?: number
	onActivated?: () => void // fired when this clip starts (gapless swap only)
}

interface FetchedClip {
	blob: Blob
	boundaries: WordBoundary[]
}

interface QueuedClip {
	key: string
	clip: FetchedClip
	opts: PlayOptions
}

interface State {
	isPlaying: boolean
	isLoading: boolean
	currentWordIndex: number
	progress: number
	error: string | null
	alignedWords: Word[]
	endedCount: number
	gaplessEndedCount: number // subset of endedCount: fired when standby was ready (audio already playing)
}

function keyOf(o: PlayOptions): string {
	return `${o.voice}|${o.startWordIndex ?? 0}|${o.text.length}|${o.text.slice(0, 64)}|${o.text.slice(-64)}`
}

function rateToPlaybackRate(rate: string): number {
	const percent = Number.parseInt(rate.replace('%', ''), 10)
	if (Number.isNaN(percent)) return 1
	return Math.max(0.25, Math.min(4, 1 + percent / 100))
}

async function fetchClip(opts: PlayOptions): Promise<FetchedClip> {
	const res = await apiFetch('/api/tts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text: opts.text, voice: opts.voice, rate: '+0%' }),
	})
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string }
		throw new Error(data.error ?? `HTTP ${res.status}`)
	}
	const data = (await res.json()) as TtsResponse
	const bin = atob(data.audio)
	const bytes = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
	return { blob: new Blob([bytes], { type: 'audio/mpeg' }), boundaries: data.boundaries }
}

function buildAligned(opts: PlayOptions, clip: FetchedClip): Word[] {
	const si = Math.max(0, Math.min(opts.startWordIndex ?? 0, Math.max(0, opts.words.length - 1)))
	const leading = opts.words.slice(0, si).map((w) => ({ ...w }))
	const tail = alignBoundaries(opts.words.slice(si), clip.boundaries)
	return leading.length ? [...leading, ...tail] : tail
}

export function useTtsPlayer() {
	// ── Two audio elements for gapless ping-pong ──────────────────────────────
	// audios[0] and audios[1] alternate. While one plays, the other is preloaded.
	// On 'ended', we swap instantly — no React cycle, no perceivable gap.
	const audiosRef = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null)
	const activeIdxRef = useRef(0) // which element is currently playing (0 or 1)

	// Object URLs for each slot (we revoke when swapping)
	const urlsRef = useRef<[string | null, string | null]>([null, null])

	// Current playback metadata (refs = safe to read from event handlers)
	const boundariesRef = useRef<WordBoundary[]>([])
	const wordsRef = useRef<Word[]>([])
	const lastReqRef = useRef<PlayOptions | null>(null)
	const playbackRateRef = useRef(1)

	// Prefetch state
	const inFlightKeyRef = useRef<string | null>(null)
	// Next clip: fetched + pre-loaded into the standby audio element
	const queuedRef = useRef<QueuedClip | null>(null)

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

	const initAudios = useCallback((): [HTMLAudioElement, HTMLAudioElement] => {
		if (!audiosRef.current) {
			const a0 = new Audio()
			const a1 = new Audio()
			a0.preload = a1.preload = 'auto'
			a0.playbackRate = a1.playbackRate = playbackRateRef.current
			audiosRef.current = [a0, a1]
		}
		return audiosRef.current
	}, [])

	const setPlaybackRate = useCallback((rate: string) => {
		const next = rateToPlaybackRate(rate)
		playbackRateRef.current = next
		if (!audiosRef.current) return
		for (const audio of audiosRef.current) audio.playbackRate = next
	}, [])

	const revokeSlot = useCallback((idx: 0 | 1) => {
		const u = urlsRef.current[idx]
		if (u) {
			URL.revokeObjectURL(u)
			urlsRef.current[idx] = null
		}
	}, [])

	const stop = useCallback(() => {
		const [a0, a1] = initAudios()
		a0.pause()
		a0.currentTime = 0
		a0.src = ''
		a1.pause()
		a1.currentTime = 0
		a1.src = ''
		revokeSlot(0)
		revokeSlot(1)
		queuedRef.current = null
		inFlightKeyRef.current = null
		setState((s) => ({
			...s,
			isPlaying: false,
			currentWordIndex: -1,
			progress: 0,
			alignedWords: [],
		}))
	}, [initAudios, revokeSlot])

	const pause = useCallback(() => {
		initAudios()[activeIdxRef.current].pause()
	}, [initAudios])

	const resume = useCallback(() => {
		initAudios()
			[activeIdxRef.current].play()
			.catch(() => {})
	}, [initAudios])

	// Activate the queued clip by swapping to the standby element.
	// Called from the 'ended' event handler — no React effect cycle.
	const activateQueuedFn = useCallback(
		(queued: QueuedClip) => {
			queuedRef.current = null
			const prevIdx = activeIdxRef.current as 0 | 1
			const newIdx = (prevIdx ^ 1) as 0 | 1
			activeIdxRef.current = newIdx

			// Silence and free the old slot
			const [a0, a1] = initAudios()
			const old = prevIdx === 0 ? a0 : a1
			old.pause()
			old.src = ''
			revokeSlot(prevIdx)

			// The standby slot already has the URL set + is buffered (from prefetch)
			const aligned = buildAligned(queued.opts, queued.clip)
			boundariesRef.current = queued.clip.boundaries
			wordsRef.current = aligned

			// Notify caller that this clip was activated (lets page.tsx update chunk tracking)
			queued.opts.onActivated?.()

			const si = queued.opts.startWordIndex ?? 0
			setState((s) => ({
				...s,
				isLoading: false,
				currentWordIndex: si > 0 ? si - 1 : -1,
				progress: 0,
				error: null,
				alignedWords: aligned,
				// Signal page.tsx that the previous clip ended and a new one started gaplessly.
				// gaplessEndedCount lets page.tsx advance page state without re-calling tts.play.
				endedCount: s.endedCount + 1,
				gaplessEndedCount: s.gaplessEndedCount + 1,
			}))

			const newActive = newIdx === 0 ? a0 : a1
			newActive.playbackRate = playbackRateRef.current
			newActive.play().catch((err: Error) => {
				setState((s) => ({ ...s, isPlaying: false, error: err.message }))
			})
		},
		[initAudios, revokeSlot],
	)

	// Keep a stable ref so the static useEffect below can call it without going stale
	const activateQueuedRef = useRef(activateQueuedFn)
	useEffect(() => {
		activateQueuedRef.current = activateQueuedFn
	}, [activateQueuedFn])

	// Attach all audio event listeners once (reads from refs only — no stale closures)
	useEffect(() => {
		const [a0, a1] = initAudios()

		const onTime = (e: Event) => {
			const [aa0, aa1] = audiosRef.current!
			const active = activeIdxRef.current === 0 ? aa0 : aa1
			if (e.target !== active) return
			const ms = active.currentTime * 1000
			const words = wordsRef.current
			let idx = -1
			for (let i = 0; i < words.length; i++) {
				const off = words[i].offsetMs
				if (off === undefined) continue
				if (off <= ms) idx = i
				else break
			}
			const dur = active.duration || 0
			setState((s) => ({
				...s,
				currentWordIndex: idx,
				progress: dur > 0 ? active.currentTime / dur : 0,
			}))
		}

		const onPlay = (e: Event) => {
			const [aa0, aa1] = audiosRef.current!
			if (e.target === (activeIdxRef.current === 0 ? aa0 : aa1)) {
				setState((s) => ({ ...s, isPlaying: true }))
			}
		}

		const onPause = (e: Event) => {
			const [aa0, aa1] = audiosRef.current!
			if (e.target === (activeIdxRef.current === 0 ? aa0 : aa1)) {
				setState((s) => ({ ...s, isPlaying: false }))
			}
		}

		const onEnded = (e: Event) => {
			const [aa0, aa1] = audiosRef.current!
			if (e.target !== (activeIdxRef.current === 0 ? aa0 : aa1)) return

			const queued = queuedRef.current
			if (queued) {
				// Gapless swap — standby is already buffered, play starts in <1ms
				activateQueuedRef.current(queued)
				return
			}

			// No queued clip → signal page.tsx to handle next chunk/page
			setState((s) => ({ ...s, isPlaying: false, progress: 1, endedCount: s.endedCount + 1 }))
		}

		for (const a of [a0, a1]) {
			a.addEventListener('timeupdate', onTime)
			a.addEventListener('play', onPlay)
			a.addEventListener('pause', onPause)
			a.addEventListener('ended', onEnded)
		}
		return () => {
			for (const a of [a0, a1]) {
				a.removeEventListener('timeupdate', onTime)
				a.removeEventListener('play', onPlay)
				a.removeEventListener('pause', onPause)
				a.removeEventListener('ended', onEnded)
			}
		}
	}, [initAudios]) // stable — reads state only via refs

	const startWithClip = useCallback(
		async (opts: PlayOptions, clip: FetchedClip) => {
			const idx = activeIdxRef.current as 0 | 1
			const [a0, a1] = initAudios()
			const active = idx === 0 ? a0 : a1
			active.pause()
			revokeSlot(idx)

			const url = URL.createObjectURL(clip.blob)
			urlsRef.current[idx] = url
			active.src = url
			active.playbackRate = playbackRateRef.current

			const aligned = buildAligned(opts, clip)
			boundariesRef.current = clip.boundaries
			wordsRef.current = aligned

			const si = opts.startWordIndex ?? 0
			setState((s) => ({
				...s,
				isLoading: false,
				currentWordIndex: si > 0 ? si - 1 : -1,
				progress: 0,
				error: null,
				alignedWords: aligned,
			}))

			try {
				await active.play()
			} catch (err) {
				setState((s) => ({ ...s, isPlaying: false, error: (err as Error).message }))
			}
		},
		[initAudios, revokeSlot],
	)

	const play = useCallback(
		async (opts: PlayOptions) => {
			lastReqRef.current = opts
			const k = keyOf(opts)

			// Hot path: standby is already loaded with this clip → gapless activate
			if (queuedRef.current?.key === k) {
				activateQueuedFn(queuedRef.current)
				return
			}

			// Discard stale queued clip
			if (queuedRef.current) {
				const [a0, a1] = initAudios()
				const standby = activeIdxRef.current === 0 ? a1 : a0
				standby.src = ''
				revokeSlot((activeIdxRef.current ^ 1) as 0 | 1)
				queuedRef.current = null
			}

			setState((s) => ({
				...s,
				isLoading: true,
				isPlaying: false,
				currentWordIndex: -1,
				progress: 0,
				error: null,
				alignedWords: opts.words,
			}))

			try {
				const clip = await fetchClip(opts)
				await startWithClip(opts, clip)
			} catch (err) {
				setState((s) => ({
					...s,
					isLoading: false,
					isPlaying: false,
					error: (err as Error).message,
				}))
			}
		},
		[activateQueuedFn, initAudios, revokeSlot, startWithClip],
	)

	// Prefetch: fetch + pre-load into standby element so swap is instant
	const prefetch = useCallback(
		async (opts: PlayOptions) => {
			const k = keyOf(opts)
			if (queuedRef.current?.key === k) return
			if (inFlightKeyRef.current === k) return
			inFlightKeyRef.current = k

			try {
				const clip = await fetchClip(opts)
				if (inFlightKeyRef.current !== k) return

				// Pre-load into standby element
				const [a0, a1] = initAudios()
				const standbyIdx = (activeIdxRef.current ^ 1) as 0 | 1
				const standby = standbyIdx === 0 ? a0 : a1

				revokeSlot(standbyIdx)
				const url = URL.createObjectURL(clip.blob)
				urlsRef.current[standbyIdx] = url
				standby.src = url
				standby.playbackRate = playbackRateRef.current
				standby.load() // start buffering now

				queuedRef.current = { key: k, clip, opts }
			} catch {
				// prefetch failure is silent
			} finally {
				if (inFlightKeyRef.current === k) inFlightKeyRef.current = null
			}
		},
		[initAudios, revokeSlot],
	)

	const updateWords = useCallback((words: Word[]) => {
		if (!boundariesRef.current.length) return
		const aligned = alignBoundaries(words, boundariesRef.current)
		wordsRef.current = aligned
		setState((s) => ({ ...s, alignedWords: aligned }))
	}, [])

	const retry = useCallback(() => {
		if (lastReqRef.current) void play(lastReqRef.current)
	}, [play])

	useEffect(
		() => () => {
			const [a0, a1] = initAudios()
			a0.pause()
			a1.pause()
			revokeSlot(0)
			revokeSlot(1)
		},
		[initAudios, revokeSlot],
	)

	return { ...state, play, prefetch, updateWords, pause, resume, stop, retry, setPlaybackRate }
}
