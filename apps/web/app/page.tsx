'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FaNotesMedical } from 'react-icons/fa'
import { AuthPanel } from '@/components/AuthPanel'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import NotesPanel from '@/components/NotesPanel'
import PdfOutline from '@/components/PdfOutline'
import PdfUploader from '@/components/PdfUploader'
import PdfViewer from '@/components/PdfViewer'
import PlayerControls from '@/components/PlayerControls'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { useAuthUser } from '@/hooks/useAuthUser'
import { useTtsPlayer } from '@/hooks/useTtsPlayer'
import { apiFetch } from '@/lib/api-fetch'
import { DEFAULT_VOICE } from '@/lib/voices'
import type { OutlineItem, PageText, PdfNote, Word } from '@/types'

function hasWordPositions(words: Word[]): boolean {
	return words.some((w) => w.x != null && w.y != null && w.w != null && w.h != null)
}

function mergeCachedPage(existing: PageText | undefined, incoming: PageText): PageText {
	if (!existing) return incoming
	if (hasWordPositions(existing.words) && !hasWordPositions(incoming.words)) return existing
	return incoming
}

interface SavedPdf {
	name: string
	path: string
	url: string
	createdAt: string
	lastPage: number | null
	wordIndex: number | null
	voice: string | null
	rate: string | null
}

interface RawPdfNote {
	id: string
	page_number?: number
	pageNumber?: number
	note_text?: string
	noteText?: string
	line_y?: number
	lineY?: number
	word_index?: number
	wordIndex?: number
	created_at?: string
	createdAt?: string
}

function normalizeNote(note: RawPdfNote): PdfNote {
	return {
		id: note.id,
		pageNumber: Number(note.pageNumber ?? note.page_number ?? 0),
		noteText: String(note.noteText ?? note.note_text ?? ''),
		lineY: Number(note.lineY ?? note.line_y ?? 0),
		wordIndex: Number(note.wordIndex ?? note.word_index ?? 0),
		createdAt: String(note.createdAt ?? note.created_at ?? ''),
	}
}

async function readApiError(res: Response, fallback: string): Promise<string> {
	try {
		const data = (await res.json()) as { error?: string }
		if (typeof data.error === 'string' && data.error.trim()) return data.error
	} catch {
		// Ignore parse failures and use fallback.
	}
	return fallback
}

export default function Home() {
	const { user, isLoaded, isSignedIn, refresh, signOut } = useAuthUser()
	const [file, setFile] = useState<File | null>(null)
	const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
	const [pageData, setPageData] = useState<PageText | null>(null)
	const [pageCache, setPageCache] = useState<Record<number, PageText>>({})
	const [numPages, setNumPages] = useState(0)
	const [currentPage, setCurrentPage] = useState(1)
	const [outline, setOutline] = useState<OutlineItem[]>([])
	const [outlineOpen, setOutlineOpen] = useState(true)
	const [voice, setVoice] = useState(DEFAULT_VOICE)
	const [rate, setRate] = useState('+0%')
	const [savedPdfs, setSavedPdfs] = useState<SavedPdf[]>([])
	const [loadingSaved, setLoadingSaved] = useState(false)
	const [initialPage, setInitialPage] = useState(1)
	const [notesByPage, setNotesByPage] = useState<Record<number, PdfNote[]>>({})
	const [allNotes, setAllNotes] = useState<PdfNote[]>([])
	const [notesOpen, setNotesOpen] = useState(false)
	const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null)
	const [currentPdfPath, setCurrentPdfPath] = useState<string | null>(null)
	const [deletingPath, setDeletingPath] = useState<string | null>(null)
	const [pendingDelete, setPendingDelete] = useState<SavedPdf | null>(null)

	// Read restore path from URL on mount (e.g. /read/user_xxx%2Ffile.pdf)
	const [restorePath] = useState<string | null>(() => {
		if (typeof window === 'undefined') return null
		const p = window.location.pathname
		if (!p.startsWith('/read/')) return null
		const raw = p.slice('/read/'.length)
		try {
			return decodeURIComponent(raw)
		} catch {
			return raw
		}
	})
	const didRestoreRef = useRef(false)
	const restoreWordIndexRef = useRef(0) // word index to start from after reload restore

	const tts = useTtsPlayer()
	const { setPlaybackRate } = tts
	const pendingAutoPageRef = useRef<number | null>(null)
	const handledEndedCountRef = useRef(0)
	const handledGaplessCountRef = useRef(0)
	const prefetchKeyRef = useRef('')
	const prevPlaybackSettingsRef = useRef({ voice: DEFAULT_VOICE, rate: '+0%' })

	// Session tracking refs — always current so unload handlers never see stale closures
	const currentPdfPathRef = useRef<string | null>(null)
	const currentPdfNameRef = useRef<string | null>(null)
	const lastWordIndexRef = useRef(0)
	const currentPageRef = useRef(1)
	const voiceRef = useRef(DEFAULT_VOICE)
	const rateRef = useRef('+0%')
	const isSignedInRef = useRef(false)
	const prevIsPlayingRef = useRef(false)
	const prevEndedCountRef = useRef(0)
	const pendingResumeRef = useRef<{ page: number; wordIndex: number } | null>(null)

	useEffect(() => {
		currentPageRef.current = currentPage
	}, [currentPage])
	useEffect(() => {
		voiceRef.current = voice
	}, [voice])
	useEffect(() => {
		rateRef.current = rate
	}, [rate])
	useEffect(() => {
		isSignedInRef.current = !!isSignedIn
	}, [isSignedIn])
	useEffect(() => {
		if (tts.currentWordIndex >= 0) lastWordIndexRef.current = tts.currentWordIndex
	}, [tts.currentWordIndex])

	const saveSession = useCallback((page: number, wordIndex: number, v: string, r: string) => {
		const path = currentPdfPathRef.current
		const name = currentPdfNameRef.current
		if (!path || !name) return
		apiFetch('/api/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path, name, page, wordIndex, voice: v, rate: r }),
		}).catch(() => {})
	}, [])

	const beaconSession = useCallback(() => {
		const path = currentPdfPathRef.current
		const name = currentPdfNameRef.current
		if (!path || !name || !isSignedInRef.current) return
		navigator.sendBeacon(
			'/api/session',
			new Blob(
				[
					JSON.stringify({
						path,
						name,
						page: currentPageRef.current,
						wordIndex: lastWordIndexRef.current,
						voice: voiceRef.current,
						rate: rateRef.current,
					}),
				],
				{ type: 'application/json' },
			),
		)
	}, [])

	useEffect(() => {
		const onHide = () => {
			if (document.visibilityState === 'hidden') beaconSession()
		}
		const onUnload = () => beaconSession()
		document.addEventListener('visibilitychange', onHide)
		window.addEventListener('beforeunload', onUnload)
		return () => {
			document.removeEventListener('visibilitychange', onHide)
			window.removeEventListener('beforeunload', onUnload)
		}
	}, [beaconSession])

	// Save on user pause/stop only — not on automatic page-end transitions
	useEffect(() => {
		const wasPlaying = prevIsPlayingRef.current
		const endedJustNow = tts.endedCount !== prevEndedCountRef.current
		prevIsPlayingRef.current = tts.isPlaying
		prevEndedCountRef.current = tts.endedCount
		if (wasPlaying && !tts.isPlaying && isSignedIn && !endedJustNow) {
			saveSession(currentPage, lastWordIndexRef.current, voice, rate)
		}
	}, [tts.isPlaying, tts.endedCount, isSignedIn, currentPage, voice, rate, saveSession])

	const refreshSavedList = useCallback(() => {
		apiFetch('/api/list-pdfs')
			.then((r) => r.json())
			.then((d) => {
				if (Array.isArray(d.files)) setSavedPdfs(d.files)
			})
			.catch(() => {})
	}, [])

	useEffect(() => {
		if (!isSignedIn) return
		setLoadingSaved(true)
		apiFetch('/api/list-pdfs')
			.then((r) => r.json())
			.then((d) => setSavedPdfs(Array.isArray(d.files) ? d.files : []))
			.catch(() => {})
			.finally(() => setLoadingSaved(false))
	}, [isSignedIn])

	const handlePageReady = useCallback(
		(p: PageText) => {
			setPageData(p)
			setPageCache((prev) => ({
				...prev,
				[p.pageNumber]: mergeCachedPage(prev[p.pageNumber], p),
			}))

			// Resume: auto-start from the saved word index
			if (pendingResumeRef.current?.page === p.pageNumber && p.text.trim()) {
				const wordIndex = Math.max(
					0,
					Math.min(pendingResumeRef.current.wordIndex, p.words.length - 1),
				)
				pendingResumeRef.current = null
				const text = p.words
					.slice(wordIndex)
					.map((w) => w.text)
					.join(' ')
					.trim()
				void tts.play({ text, voice, rate, words: p.words, startWordIndex: wordIndex })
				return
			}

			// Continuous page advance: auto-play full page
			if (pendingAutoPageRef.current === p.pageNumber && p.text.trim()) {
				pendingAutoPageRef.current = null
				void tts.play({ text: p.text, voice, rate, words: p.words })
				return
			}

			if (tts.isPlaying) tts.updateWords(p.words)
		},
		[rate, tts, voice],
	)

	const handlePrefetchPageReady = useCallback((p: PageText) => {
		setPageCache((prev) => ({
			...prev,
			[p.pageNumber]: mergeCachedPage(prev[p.pageNumber], p),
		}))
	}, [])

	const handleLoad = useCallback((n: number) => setNumPages(n), [])

	const handlePageChange = useCallback(
		(n: number) => {
			pendingAutoPageRef.current = null
			restoreWordIndexRef.current = 0
			tts.stop()
			setPageData(pageCache[n] ?? null)
			setCurrentPage(n)
		},
		[pageCache, tts],
	)

	const resetReader = useCallback(() => {
		pendingAutoPageRef.current = null
		pendingResumeRef.current = null
		restoreWordIndexRef.current = 0
		prefetchKeyRef.current = ''
		handledEndedCountRef.current = 0
		lastWordIndexRef.current = 0
		tts.stop()
		setPageData(null)
		setPageCache({})
		setNumPages(0)
		setCurrentPage(1)
		setOutline([])
		setInitialPage(1)
		setNotesByPage({})
		setAllNotes([])
		setHighlightNoteId(null)
		setCurrentPdfPath(null)
	}, [tts])

	const handleFile = useCallback(
		(f: File) => {
			resetReader()
			setVoice(DEFAULT_VOICE)
			setRate('+0%')
			setPlaybackRate('+0%')
			currentPdfPathRef.current = null
			setCurrentPdfPath(null)
			currentPdfNameRef.current = f.name
			setFile(f)

			if (isSignedIn) {
				setUploadStatus('uploading')
				const fd = new FormData()
				fd.append('file', f)
				apiFetch('/api/upload-pdf', { method: 'POST', body: fd })
					.then((r) => r.json())
					.then((d: { path?: string }) => {
						if (d.path) {
							currentPdfPathRef.current = d.path
							setCurrentPdfPath(d.path)
							window.history.replaceState(null, '', `/read/${encodeURIComponent(d.path)}`)
						}
						setUploadStatus('done')
						refreshSavedList()
					})
					.catch(() => setUploadStatus('error'))
					.finally(() => setTimeout(() => setUploadStatus('idle'), 3000))
			}
		},
		[isSignedIn, resetReader, refreshSavedList, setPlaybackRate],
	)

	const handleOpenSaved = useCallback(
		async (pdf: SavedPdf) => {
			try {
				const res = await apiFetch(pdf.url)
				const blob = await res.blob()
				const f = new File([blob], pdf.name, { type: 'application/pdf' })
				resetReader()
				if (pdf.voice) setVoice(pdf.voice)
				if (pdf.rate) setRate(pdf.rate)
				setInitialPage(pdf.lastPage ?? 1)
				currentPdfPathRef.current = pdf.path
				setCurrentPdfPath(pdf.path)
				currentPdfNameRef.current = pdf.name
				window.history.replaceState(null, '', `/read/${encodeURIComponent(pdf.path)}`)
				setFile(f)
			} catch {
				/* ignore */
			}
		},
		[resetReader],
	)

	const handleResumeSaved = useCallback(
		async (pdf: SavedPdf) => {
			try {
				const res = await apiFetch(pdf.url)
				const blob = await res.blob()
				const f = new File([blob], pdf.name, { type: 'application/pdf' })
				resetReader()
				if (pdf.voice) setVoice(pdf.voice)
				if (pdf.rate) setRate(pdf.rate)
				const resumePage = pdf.lastPage ?? 1
				setInitialPage(resumePage)
				pendingResumeRef.current = { page: resumePage, wordIndex: pdf.wordIndex ?? 0 }
				currentPdfPathRef.current = pdf.path
				setCurrentPdfPath(pdf.path)
				currentPdfNameRef.current = pdf.name
				window.history.replaceState(null, '', `/read/${encodeURIComponent(pdf.path)}`)
				setFile(f)
			} catch {
				/* ignore */
			}
		},
		[resetReader],
	)

	const handleBackHome = useCallback(() => {
		if (isSignedIn) {
			const wordIndex = tts.currentWordIndex >= 0 ? tts.currentWordIndex : lastWordIndexRef.current
			saveSession(currentPage, wordIndex, voice, rate)
		}
		resetReader()
		currentPdfPathRef.current = null
		currentPdfNameRef.current = null
		setFile(null)
		window.history.replaceState(null, '', '/')
	}, [currentPage, isSignedIn, rate, resetReader, saveSession, tts.currentWordIndex, voice])

	const handleDeleteSaved = useCallback(
		async (pdf: SavedPdf) => {
			setDeletingPath(pdf.path)
			try {
				const res = await apiFetch(`/api/pdf?path=${encodeURIComponent(pdf.path)}`, {
					method: 'DELETE',
				})
				if (!res.ok) throw new Error(`Delete failed (${res.status})`)
				setSavedPdfs((prev) => prev.filter((p) => p.path !== pdf.path))
				setPendingDelete(null)
				if (currentPdfPathRef.current === pdf.path) handleBackHome()
			} catch (err) {
				window.alert(err instanceof Error ? err.message : 'Could not delete PDF.')
			} finally {
				setDeletingPath(null)
			}
		},
		[handleBackHome],
	)

	// Restore session when reloading a /read/:path URL.
	// Use handleOpenSaved (not Resume) — autoplay is blocked by browser after reload.
	// Store word index so user's manual Play starts from the right position.
	useEffect(() => {
		if (!restorePath || didRestoreRef.current) return
		if (!isSignedIn || loadingSaved) return
		const pdf = savedPdfs.find((p) => p.path === restorePath)
		if (!pdf) return
		didRestoreRef.current = true
		restoreWordIndexRef.current = pdf.wordIndex ?? 0
		void handleOpenSaved(pdf)
	}, [restorePath, isSignedIn, loadingSaved, savedPdfs, handleOpenSaved])

	const onPlay = useCallback(() => {
		if (!pageData || !pageData.text.trim()) return
		if (tts.alignedWords.length > 0) {
			tts.resume()
			return
		}
		const startWordIndex = restoreWordIndexRef.current
		restoreWordIndexRef.current = 0
		if (startWordIndex > 0) {
			const text = pageData.words
				.slice(startWordIndex)
				.map((w) => w.text)
				.join(' ')
				.trim()
			void tts.play({
				text: text || pageData.text,
				voice,
				rate,
				words: pageData.words,
				startWordIndex,
			})
		} else {
			void tts.play({ text: pageData.text, voice, rate, words: pageData.words })
		}
	}, [pageData, voice, rate, tts])

	const handleRateChange = useCallback(
		(nextRate: string) => {
			setRate(nextRate)
			setPlaybackRate(nextRate)
		},
		[setPlaybackRate],
	)

	useEffect(() => {
		setPlaybackRate(rate)
	}, [rate, setPlaybackRate])

	// Restart from current word when voice changes. Speed changes use audio.playbackRate.
	useEffect(() => {
		const prev = prevPlaybackSettingsRef.current
		const changed = prev.voice !== voice
		prevPlaybackSettingsRef.current = { voice, rate }
		if (!changed) return
		prefetchKeyRef.current = ''
		// hasAudio: either actively playing, or paused mid-playback (alignedWords populated)
		const hasAudio = tts.isPlaying || tts.alignedWords.length > 0
		if (!hasAudio || !pageData || !pageData.words.length) return
		const startWordIndex = Math.max(0, Math.min(tts.currentWordIndex, pageData.words.length - 1))
		const text = pageData.words
			.slice(startWordIndex)
			.map((w) => w.text)
			.join(' ')
			.trim()
		if (!text) return
		void tts.play({ text, voice, rate, words: pageData.words, startWordIndex })
	}, [pageData, rate, tts, voice])

	// Prefetch next page at 60% progress
	useEffect(() => {
		if (!tts.isPlaying || tts.progress < 0.6) return
		const nextPage = currentPage + 1
		if (nextPage > numPages) return
		const next = pageCache[nextPage]
		if (!next || !next.text.trim()) return
		const k = `${nextPage}|${voice}|${next.text.length}|${next.text.slice(0, 32)}|${next.text.slice(-32)}`
		if (prefetchKeyRef.current === k) return
		prefetchKeyRef.current = k
		void tts.prefetch({ text: next.text, voice, rate: rateRef.current, words: next.words })
	}, [currentPage, numPages, pageCache, tts, voice])

	// Auto-advance to next page when audio ends.
	// If gaplessEndedCount also incremented, the standby element already started playing —
	// just update page state; do NOT call tts.play again or it will interrupt the audio.
	useEffect(() => {
		if (tts.endedCount === 0) return
		if (tts.endedCount === handledEndedCountRef.current) return
		handledEndedCountRef.current = tts.endedCount

		const wasGapless = tts.gaplessEndedCount > handledGaplessCountRef.current
		handledGaplessCountRef.current = tts.gaplessEndedCount

		const nextPage = currentPage + 1
		if (nextPage > numPages) return
		const next = pageCache[nextPage]
		setCurrentPage(nextPage)
		setPageData(next ?? null)

		if (wasGapless) {
			// Audio already running via ping-pong swap — page state updated, nothing else to do.
			pendingAutoPageRef.current = null
			return
		}

		if (next?.text.trim()) {
			pendingAutoPageRef.current = null
			void tts.play({ text: next.text, voice, rate, words: next.words })
			return
		}
		pendingAutoPageRef.current = nextPage
	}, [currentPage, numPages, pageCache, rate, tts, voice])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null
			if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
			if (e.code === 'Space') {
				e.preventDefault()
				if (tts.isPlaying) tts.pause()
				else if (tts.alignedWords.length) tts.resume()
				else onPlay()
			} else if (e.code === 'ArrowRight') {
				handlePageChange(Math.min(numPages, currentPage + 1))
			} else if (e.code === 'ArrowLeft') {
				handlePageChange(Math.max(1, currentPage - 1))
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [tts, onPlay, handlePageChange, numPages, currentPage])

	const fetchNotesForPage = useCallback(async (path: string, page: number) => {
		const res = await apiFetch(`/api/notes?path=${encodeURIComponent(path)}&page=${page}`)
		if (!res.ok) throw new Error('Failed to load notes')
		const data = (await res.json()) as { notes?: RawPdfNote[] }
		const normalized = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : []
		setNotesByPage((prev) => ({ ...prev, [page]: normalized }))
	}, [])

	const fetchAllNotes = useCallback(async (path: string) => {
		const res = await apiFetch(`/api/notes?path=${encodeURIComponent(path)}`)
		if (!res.ok) return
		const data = (await res.json()) as { notes?: RawPdfNote[] }
		const normalized = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : []
		setAllNotes(normalized)
	}, [])

	useEffect(() => {
		if (!currentPdfPath) return
		fetchNotesForPage(currentPdfPath, currentPage).catch((err) => {
			// biome-ignore lint/suspicious/noConsole: client diagnostic; swap for logger when a browser-safe one exists
			console.warn('[notes] fetch failed', err)
		})
	}, [currentPage, currentPdfPath, fetchNotesForPage])

	useEffect(() => {
		if (!currentPdfPath) {
			setAllNotes([])
			return
		}
		fetchAllNotes(currentPdfPath).catch(() => {})
	}, [currentPdfPath, fetchAllNotes])

	const handleAddNote = useCallback(
		async (lineY: number, wordIndex: number, text: string) => {
			if (!currentPdfPath) throw new Error('Missing PDF path')
			const res = await apiFetch('/api/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: currentPdfPath,
					pageNumber: currentPage,
					noteText: text,
					lineY,
					wordIndex,
				}),
			})
			if (!res.ok) throw new Error(await readApiError(res, 'Failed to save note'))
			const data = (await res.json()) as { note?: RawPdfNote }
			if (!data.note) return
			const note = normalizeNote(data.note)
			setNotesByPage((prev) => {
				const nextPageNotes = [
					...(prev[currentPage] ?? []).filter((n) => n.id !== note.id),
					note,
				].sort((a, b) => a.lineY - b.lineY)
				return { ...prev, [currentPage]: nextPageNotes }
			})
			setAllNotes((prev) =>
				[...prev.filter((n) => n.id !== note.id), note].sort((a, b) =>
					a.pageNumber !== b.pageNumber ? a.pageNumber - b.pageNumber : a.lineY - b.lineY,
				),
			)
		},
		[currentPage, currentPdfPath],
	)

	const handleUpdateNote = useCallback(
		async (noteId: string, text: string) => {
			const res = await apiFetch(`/api/notes?id=${encodeURIComponent(noteId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ noteText: text }),
			})
			if (!res.ok) throw new Error(await readApiError(res, 'Failed to update note'))
			const data = (await res.json()) as { note?: RawPdfNote }
			const updated = data.note ? normalizeNote(data.note) : null
			setNotesByPage((prev) => ({
				...prev,
				[currentPage]: (prev[currentPage] ?? []).map((n) => {
					if (n.id !== noteId) return n
					return updated ?? { ...n, noteText: text }
				}),
			}))
			setAllNotes((prev) =>
				prev.map((n) => {
					if (n.id !== noteId) return n
					return updated ?? { ...n, noteText: text }
				}),
			)
		},
		[currentPage],
	)

	const handleDeleteNote = useCallback(
		async (noteId: string) => {
			const res = await apiFetch(`/api/notes?id=${encodeURIComponent(noteId)}`, {
				method: 'DELETE',
			})
			if (!res.ok) throw new Error(await readApiError(res, 'Failed to delete note'))
			setNotesByPage((prev) => ({
				...prev,
				[currentPage]: (prev[currentPage] ?? []).filter((n) => n.id !== noteId),
			}))
			setAllNotes((prev) => prev.filter((n) => n.id !== noteId))
		},
		[currentPage],
	)

	if (!isLoaded) {
		return (
			<main
				style={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'var(--bg)',
				}}
			>
				<div
					style={{
						width: 28,
						height: 28,
						border: '2.5px solid var(--border)',
						borderTopColor: 'var(--accent)',
						borderRadius: '50%',
						animation: 'spin 0.8s linear infinite',
					}}
				/>
				<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
			</main>
		)
	}

	if (!user) {
		return (
			<main
				style={{
					minHeight: '100vh',
					position: 'relative',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'var(--bg)',
					padding: '2rem',
				}}
			>
				<div style={{ position: 'absolute', top: 18, right: 18 }}>
					<ThemeToggle compact />
				</div>
				{/* Logo */}
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: 24,
						maxWidth: 400,
						width: '100%',
					}}
				>
					<Image
						src="/readr-logo-nobg.png"
						alt="Readr"
						width={64}
						height={64}
						style={{ objectFit: 'contain' }}
					/>
					<div style={{ textAlign: 'center' }}>
						<h1 className="brand-logo" style={{ fontSize: 30, margin: '0 0 8px' }}>
							readr
						</h1>
						<p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
							Word-synced narration with
							<br />
							Microsoft Edge neural voices
						</p>
					</div>
					<AuthPanel onSignedIn={refresh} />
					<p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
						Upload &amp; sync across sessions after sign-in
					</p>
				</div>
			</main>
		)
	}

	if (!file) {
		return (
			<main
				style={{
					minHeight: '100vh',
					background: 'var(--bg)',
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				{/* Header */}
				<header
					style={{
						borderBottom: '1px solid var(--border)',
						background: 'var(--bg)',
						padding: '0 24px',
						height: 59,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
						<Image
							src="/readr-logo-nobg.png"
							alt="readr"
							width={28}
							height={28}
							className="brand-mark"
						/>
						<span className="brand-logo">readr</span>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<ThemeToggle compact />
						<UserMenu user={user} onSignOut={signOut} />
					</div>
				</header>

				{/* Hero + upload */}
				<div
					style={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						padding: '64px 24px 48px',
						maxWidth: 600,
						margin: '0 auto',
						width: '100%',
					}}
				>
					<h1
						style={{
							fontFamily: 'var(--font-display)',
							fontSize: 30,
							fontWeight: 400,
							letterSpacing: '0.01em',
							color: 'var(--text-1)',
							margin: '0 0 8px',
							textAlign: 'center',
						}}
					>
						Open a PDF
					</h1>
					<p
						style={{
							fontSize: 14,
							color: 'var(--text-3)',
							margin: '0 0 36px',
							textAlign: 'center',
						}}
					>
						Drag &amp; drop or click below
					</p>
					<PdfUploader onFile={handleFile} />

					{/* Library */}
					{(loadingSaved || savedPdfs.length > 0) && (
						<div style={{ width: '100%', marginTop: 48 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
								<span
									style={{
										fontSize: 10,
										fontWeight: 700,
										letterSpacing: '0.12em',
										textTransform: 'uppercase',
										color: 'var(--text-3)',
									}}
								>
									Your Library
								</span>
								<div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
							</div>

							{loadingSaved ? (
								<div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>
									Loading…
								</div>
							) : (
								<ul
									style={{
										listStyle: 'none',
										margin: 0,
										padding: 0,
										display: 'flex',
										flexDirection: 'column',
										gap: 8,
									}}
								>
									{savedPdfs.map((pdf) => (
										<li
											key={pdf.path}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 12,
												padding: '10px 12px 10px 14px',
												borderRadius: 18,
												border: '1px solid var(--border)',
												background: 'var(--surface)',
												cursor: 'pointer',
												transition: 'border-color 0.15s, background 0.15s',
											}}
											onMouseEnter={(e) => {
												;(e.currentTarget as HTMLLIElement).style.borderColor = 'var(--accent)'
												;(e.currentTarget as HTMLLIElement).style.background = 'var(--soft)'
											}}
											onMouseLeave={(e) => {
												;(e.currentTarget as HTMLLIElement).style.borderColor = 'var(--border)'
												;(e.currentTarget as HTMLLIElement).style.background = 'var(--surface)'
											}}
											onClick={() => void handleOpenSaved(pdf)}
										>
											<div
												style={{
													width: 38,
													height: 38,
													borderRadius: 12,
													background: 'var(--accent-s)',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													flexShrink: 0,
												}}
											>
												<svg width="16" height="18" viewBox="0 0 24 24" fill="none">
													<path
														d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
														stroke="var(--accent)"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													/>
													<path
														d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
														stroke="var(--accent)"
														strokeWidth="1.5"
														strokeLinecap="round"
													/>
												</svg>
											</div>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														fontSize: 14,
														fontWeight: 600,
														color: 'var(--text-1)',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
														whiteSpace: 'nowrap',
													}}
												>
													{pdf.name}
												</div>
												{pdf.lastPage && (
													<div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
														Last read: page {pdf.lastPage}
													</div>
												)}
											</div>
											<button
												type="button"
												aria-label={`Delete ${pdf.name}`}
												title="Delete"
												disabled={deletingPath === pdf.path}
												onClick={(e) => {
													e.stopPropagation()
													setPendingDelete(pdf)
												}}
												style={{
													flexShrink: 0,
													width: 30,
													height: 30,
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													padding: 0,
													borderRadius: 8,
													border: 'none',
													background: 'transparent',
													color: 'var(--text-3)',
													cursor: deletingPath === pdf.path ? 'default' : 'pointer',
													opacity: deletingPath === pdf.path ? 0.5 : 1,
													transition: 'color 0.15s, background 0.15s',
												}}
												onMouseEnter={(e) => {
													if (deletingPath === pdf.path) return
													e.currentTarget.style.color = 'var(--danger)'
													e.currentTarget.style.background = 'var(--surface-2)'
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.color = 'var(--text-3)'
													e.currentTarget.style.background = 'transparent'
												}}
											>
												<svg
													width="15"
													height="15"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.9"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden="true"
												>
													<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
												</svg>
											</button>
											{pdf.lastPage != null && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation()
														void handleResumeSaved(pdf)
													}}
													className="btn-primary"
													style={{ flexShrink: 0, padding: '7px 14px', fontSize: 12 }}
												>
													Resume
												</button>
											)}
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				<ConfirmDialog
					open={pendingDelete !== null}
					title="Delete this document?"
					body={
						<>
							<span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{pendingDelete?.name}</span>{' '}
							will be removed from your library, together with its notes and saved reading position.
							This cannot be undone.
						</>
					}
					confirmLabel="Delete"
					busy={deletingPath !== null}
					onConfirm={() => {
						if (pendingDelete) void handleDeleteSaved(pendingDelete)
					}}
					onCancel={() => {
						if (deletingPath === null) setPendingDelete(null)
					}}
				/>
			</main>
		)
	}

	const noTextMessage =
		pageData && pageData.words.length === 0
			? 'No text on this page (scanned/image PDFs are not supported — no OCR).'
			: null

	return (
		<main
			style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}
		>
			{/* Reader header */}
			<header
				style={{
					borderBottom: '1px solid var(--border)',
					background: 'var(--bg)',
					padding: '0 20px',
					height: 59,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 16,
					flexShrink: 0,
				}}
			>
				{/* Left: home + brand + contents */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
					<button type="button" className="btn-pill" onClick={handleBackHome} title="Back to home">
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M19 12H5M11 18l-6-6 6-6" />
						</svg>
						Home
					</button>
					<span aria-hidden="true" style={{ width: 1, height: 18, background: 'var(--border)' }} />
					<Image
						src="/readr-logo-nobg.png"
						alt="readr"
						width={26}
						height={26}
						className="brand-mark"
					/>
					<span className="brand-logo" style={{ fontSize: 18 }}>
						readr
					</span>
					{outline.length > 0 && (
						<button
							type="button"
							className={`btn-pill icon-only${outlineOpen ? ' active' : ''}`}
							onClick={() => setOutlineOpen((o) => !o)}
							aria-label="Toggle contents"
							title="Contents"
							style={{ marginLeft: 4 }}
						>
							<svg
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
								aria-hidden="true"
							>
								<path d="M4 7h16M4 12h16M4 17h16" />
							</svg>
						</button>
					)}
				</div>

				{/* Right: status + actions */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
					{uploadStatus === 'uploading' && (
						<span
							style={{
								fontSize: 12,
								color: 'var(--text-3)',
								display: 'flex',
								alignItems: 'center',
								gap: 5,
							}}
						>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: '50%',
									background: 'var(--accent)',
									display: 'inline-block',
									animation: 'pulse 1.2s ease infinite',
								}}
							/>
							Saving
						</span>
					)}
					{uploadStatus === 'done' && (
						<span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Saved</span>
					)}
					{uploadStatus === 'error' && (
						<span style={{ fontSize: 12, color: 'var(--danger)' }}>Save failed</span>
					)}

					{currentPdfPath && (
						<button
							type="button"
							onClick={() => setNotesOpen((o) => !o)}
							className={`btn-pill icon-only${notesOpen ? ' active' : ''}`}
							aria-label="Toggle notes"
							title="All notes"
							style={{ position: 'relative' }}
						>
							<FaNotesMedical size={14} />
							{allNotes.length > 0 && (
								<span
									style={{
										position: 'absolute',
										top: -4,
										right: -4,
										minWidth: 15,
										height: 15,
										padding: '0 4px',
										borderRadius: 99,
										background: 'var(--accent)',
										color: 'var(--on-accent)',
										fontSize: 9.5,
										fontWeight: 700,
										lineHeight: '15px',
										textAlign: 'center',
									}}
								>
									{allNotes.length}
								</span>
							)}
						</button>
					)}

					<ThemeToggle compact />

					<button type="button" className="btn-pill" onClick={handleBackHome}>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M12 5v14M5 12h14" />
						</svg>
						New PDF
					</button>
					<UserMenu user={user} onSignOut={signOut} />
				</div>
			</header>
			<div className="reader-progress-track" aria-hidden="true">
				<div
					className="reader-progress-fill"
					style={{ width: `${numPages > 0 ? (currentPage / numPages) * 100 : 0}%` }}
				/>
			</div>

			<div className="flex-1 min-h-0 flex">
				{outlineOpen && outline.length > 0 && (
					<PdfOutline items={outline} currentPage={currentPage} onNavigate={handlePageChange} />
				)}
				<div className="flex-1 min-w-0">
					<PdfViewer
						file={file}
						currentPage={currentPage}
						initialPage={initialPage}
						onPageChange={handlePageChange}
						onPageReady={handlePageReady}
						onPrefetchPageReady={handlePrefetchPageReady}
						onLoad={handleLoad}
						onOutline={setOutline}
						currentWordIndex={tts.currentWordIndex}
						noTextMessage={noTextMessage}
						notes={currentPdfPath ? (notesByPage[currentPage] ?? []) : []}
						highlightNoteId={highlightNoteId}
						onNoteAdd={currentPdfPath ? handleAddNote : undefined}
						onNoteUpdate={currentPdfPath ? handleUpdateNote : undefined}
						onNoteDelete={currentPdfPath ? handleDeleteNote : undefined}
					/>
				</div>
				{notesOpen && currentPdfPath && (
					<NotesPanel
						notes={allNotes}
						currentPage={currentPage}
						onNavigate={(page, noteId) => {
							handlePageChange(page)
							setHighlightNoteId(noteId)
							setTimeout(() => setHighlightNoteId(null), 1800)
						}}
						onEdit={handleUpdateNote}
						onDelete={handleDeleteNote}
					/>
				)}
			</div>
			<PlayerControls
				voice={voice}
				onVoiceChange={setVoice}
				rate={rate}
				onRateChange={handleRateChange}
				isPlaying={tts.isPlaying}
				isLoading={tts.isLoading}
				onPlay={onPlay}
				onPause={tts.pause}
				onStop={tts.stop}
				progress={tts.progress}
				error={tts.error}
				onRetry={tts.retry}
			/>
		</main>
	)
}
