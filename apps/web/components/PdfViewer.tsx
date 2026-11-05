'use client'

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { FaNotesMedical } from 'react-icons/fa'
import type { OutlineItem, PageText, PdfNote, Word } from '@/types'

// pdf.js outline node shape (narrow subset we need).
interface RawOutlineItem {
	title: string
	dest: string | unknown[] | null
	items: RawOutlineItem[]
}

interface PdfDocLike {
	getDestination: (name: string) => Promise<unknown[] | null>
	getPageIndex: (ref: unknown) => Promise<number>
}

async function resolveOutline(doc: unknown, items: RawOutlineItem[]): Promise<OutlineItem[]> {
	const d = doc as PdfDocLike
	const out: OutlineItem[] = []
	for (const it of items) {
		let pageNumber: number | undefined
		try {
			let dest = it.dest as string | unknown[] | null
			if (typeof dest === 'string') dest = await d.getDestination(dest)
			if (Array.isArray(dest) && dest.length > 0) {
				const idx = await d.getPageIndex(dest[0])
				pageNumber = idx + 1
			}
		} catch {
			// Unresolvable destination — leave pageNumber undefined.
		}
		const children = it.items?.length ? await resolveOutline(doc, it.items) : []
		out.push({ title: it.title, pageNumber, items: children })
	}
	return out
}

interface Line {
	y: number
	bottom: number
	firstWordIndex: number
}

function computeLines(words: Word[]): Line[] {
	const lines: Line[] = []
	for (let i = 0; i < words.length; i++) {
		const w = words[i]
		if (w.y == null || w.h == null) continue
		const found = lines.find((l) => w.y! >= l.y - 4 && w.y! <= l.y + 14)
		if (found) {
			found.bottom = Math.max(found.bottom, w.y! + w.h!)
		} else {
			lines.push({ y: w.y!, bottom: w.y! + w.h!, firstWordIndex: i })
		}
	}
	return lines.sort((a, b) => a.y - b.y)
}

interface Props {
	file: File | null
	currentPage: number
	initialPage?: number
	onPageChange: (page: number) => void
	/** Scroll-driven page change: the user moved the viewport, not a nav control. */
	onVisiblePageChange?: (page: number) => void
	onPageReady: (page: PageText) => void
	onPrefetchPageReady?: (page: PageText) => void
	onLoad: (numPages: number) => void
	onOutline?: (items: OutlineItem[]) => void
	currentWordIndex: number
	/** Narration is playing or paused mid-page. */
	audioActive?: boolean
	noTextMessage?: string | null
	// Notes
	notes?: PdfNote[]
	highlightNoteId?: string | null
	onNoteAdd?: (lineY: number, wordIndex: number, text: string) => Promise<void>
	onNoteUpdate?: (noteId: string, text: string) => Promise<void>
	onNoteDelete?: (noteId: string) => Promise<void>
}

interface CanvasSize {
	cssW: number
	cssH: number
}

const EMPTY_WORDS: Word[] = []
const SCALE = 1.4
const PAGE_GAP = 18
const RENDER_AHEAD = 2
const KEEP_BEHIND = 3

// PDF.js is imported dynamically — it's a client-only lib w/ a worker.
export default function PdfViewer({
	file,
	currentPage,
	initialPage,
	onPageChange,
	onVisiblePageChange,
	onPageReady,
	onPrefetchPageReady,
	onLoad,
	onOutline,
	currentWordIndex,
	audioActive = false,
	noTextMessage,
	notes,
	highlightNoteId,
	onNoteAdd,
	onNoteUpdate,
	onNoteDelete,
}: Props) {
	const [numPages, setNumPages] = useState(0)
	const [loading, setLoading] = useState(false)
	const [sizes, setSizes] = useState<Record<number, CanvasSize>>({})
	const [wordsByPage, setWordsByPage] = useState<Record<number, Word[]>>({})
	const [rendered, setRendered] = useState<Record<number, boolean>>({})

	const pdfRef = useRef<unknown>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map())
	const renderedRef = useRef<Set<number>>(new Set())
	const renderingRef = useRef<Set<number>>(new Set())
	const renderCancelsRef = useRef<Map<number, { cancelled: boolean }>>(new Map())
	const wordsRef = useRef<Record<number, Word[]>>({})
	const lastScrolledRef = useRef(-1)
	const reportedPageRef = useRef(0)
	const sentPageRef = useRef(0)
	const suppressReportUntilRef = useRef(0)
	const scrollRafRef = useRef(0)
	const followRef = useRef(true)
	const audioActiveRef = useRef(audioActive)
	const programmaticScrollUntilRef = useRef(0)
	const [showFollow, setShowFollow] = useState(false)
	const [showScrollTop, setShowScrollTop] = useState(false)

	const currentPageRef = useRef(currentPage)
	const onPageReadyRef = useRef(onPageReady)
	const onPrefetchPageReadyRef = useRef(onPrefetchPageReady)
	const onVisiblePageChangeRef = useRef(onVisiblePageChange)

	useEffect(() => {
		currentPageRef.current = currentPage
		onPageReadyRef.current = onPageReady
		onPrefetchPageReadyRef.current = onPrefetchPageReady
		onVisiblePageChangeRef.current = onVisiblePageChange
	}, [currentPage, onPageReady, onPrefetchPageReady, onVisiblePageChange])

	useEffect(() => {
		audioActiveRef.current = audioActive
		if (!audioActive) {
			followRef.current = true
			setShowFollow(false)
		}
	}, [audioActive])

	/** Floating affordances: back to spoken word, and back to top. */
	const refreshFloating = useCallback(() => {
		const scrollEl = scrollRef.current
		if (!scrollEl) return
		setShowScrollTop(scrollEl.scrollTop > 360)
		if (!audioActiveRef.current) {
			setShowFollow(false)
			return
		}
		const el = pageElsRef.current
			.get(currentPageRef.current)
			?.querySelector('.pdf-highlight.visible')
		if (!el) {
			setShowFollow(false)
			return
		}
		const containerRect = scrollEl.getBoundingClientRect()
		const rect = el.getBoundingClientRect()
		const visible = rect.bottom > containerRect.top + 20 && rect.top < containerRect.bottom - 100
		setShowFollow(!visible)
	}, [])

	const pageWords = wordsByPage[currentPage] ?? EMPTY_WORDS
	const activeSize = sizes[currentPage] ?? { cssW: 0, cssH: 0 }

	// Note state
	const [lines, setLines] = useState<Line[]>([])
	const [hoveredLine, setHoveredLine] = useState<Line | null>(null)
	const [editingLine, setEditingLine] = useState<Line | null>(null)
	const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
	const [noteText, setNoteText] = useState('')
	const [noteError, setNoteError] = useState<string | null>(null)
	const [isSavingNote, setIsSavingNote] = useState(false)
	const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
	const pageContainerRef = useRef<HTMLDivElement>(null)
	const [popoverFixedStyle, setPopoverFixedStyle] = useState<CSSProperties>({})

	useEffect(() => {
		setLines(computeLines(pageWords))
		setHoveredLine(null)
		setEditingLine(null)
		setEditingNoteId(null)
		setNoteText('')
		setNoteError(null)
		setIsSavingNote(false)
	}, [pageWords])

	const cancelNote = useCallback(() => {
		setEditingLine(null)
		setEditingNoteId(null)
		setNoteText('')
		setNoteError(null)
		setIsSavingNote(false)
	}, [])

	// Anchor the note popover to the active page.
	useEffect(() => {
		pageContainerRef.current = pageElsRef.current.get(currentPage) ?? null
	}, [currentPage, rendered])

	useEffect(() => {
		if (!editingLine || !pageContainerRef.current) return
		const rect = pageContainerRef.current.getBoundingClientRect()
		const topInPdf = Math.min(editingLine.y, Math.max(0, activeSize.cssH - 210))
		const top = rect.top + topInPdf
		const popoverW = 280
		const gap = 14
		if (rect.right + popoverW + gap <= window.innerWidth) {
			setPopoverFixedStyle({ position: 'fixed', top, left: rect.right + gap, width: popoverW })
		} else {
			setPopoverFixedStyle({
				position: 'fixed',
				top,
				right: window.innerWidth - rect.right + 10,
				width: Math.min(popoverW, rect.width - 20),
			})
		}
	}, [editingLine, activeSize.cssH])

	const openNoteEditor = useCallback((line: Line) => {
		setEditingLine(line)
		setEditingNoteId(null)
		setNoteText('')
		setNoteError(null)
		setHoveredLine(null)
		setTimeout(() => noteTextareaRef.current?.focus(), 50)
	}, [])

	const openExistingNote = useCallback((note: PdfNote) => {
		setEditingLine({ y: note.lineY, bottom: note.lineY + 20, firstWordIndex: note.wordIndex })
		setEditingNoteId(note.id)
		setNoteText(note.noteText)
		setNoteError(null)
		setHoveredLine(null)
		setTimeout(() => noteTextareaRef.current?.focus(), 50)
	}, [])

	const handleSaveNote = useCallback(async () => {
		const text = noteText.trim()
		if (!editingLine || !text || isSavingNote) return
		setIsSavingNote(true)
		setNoteError(null)
		try {
			if (editingNoteId && onNoteUpdate) {
				await onNoteUpdate(editingNoteId, text)
			} else if (onNoteAdd) {
				await onNoteAdd(editingLine.y, editingLine.firstWordIndex, text)
			}
			cancelNote()
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to save note'
			setNoteError(message)
		} finally {
			setIsSavingNote(false)
		}
	}, [editingLine, editingNoteId, noteText, onNoteAdd, onNoteUpdate, cancelNote, isSavingNote])

	const handleDeleteNote = useCallback(async () => {
		if (!editingNoteId || !onNoteDelete || isSavingNote) return
		setIsSavingNote(true)
		setNoteError(null)
		try {
			await onNoteDelete(editingNoteId)
			cancelNote()
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete note'
			setNoteError(message)
		} finally {
			setIsSavingNote(false)
		}
	}, [editingNoteId, onNoteDelete, cancelNote, isSavingNote])

	/** Renders one page's canvas and text layer, then measures word rectangles. */
	const renderPage = useCallback(async (pageNumber: number) => {
		if (renderedRef.current.has(pageNumber) || renderingRef.current.has(pageNumber)) return
		const doc = pdfRef.current as { getPage: (n: number) => Promise<unknown> } | null
		const shell = pageElsRef.current.get(pageNumber)
		if (!doc || !shell) return

		const canvas = shell.querySelector('canvas')
		const tlContainer = shell.querySelector<HTMLDivElement>('.pdf-textlayer')
		if (!canvas || !tlContainer) return

		renderingRef.current.add(pageNumber)
		const token = { cancelled: false }
		renderCancelsRef.current.set(pageNumber, token)

		try {
			const pdfjs = await import('pdfjs-dist')
			const page = (await doc.getPage(pageNumber)) as {
				getViewport: (args: { scale: number }) => {
					width: number
					height: number
					transform: number[]
				}
				getTextContent: () => Promise<unknown>
				render: (args: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
					promise: Promise<void>
					cancel: () => void
				}
			}
			if (token.cancelled) return

			const dpr = window.devicePixelRatio || 1
			const cssViewport = page.getViewport({ scale: SCALE })
			const renderViewport = page.getViewport({ scale: SCALE * dpr })

			canvas.width = renderViewport.width
			canvas.height = renderViewport.height
			canvas.style.width = `${cssViewport.width}px`
			canvas.style.height = `${cssViewport.height}px`
			const ctx = canvas.getContext('2d')!
			const task = page.render({ canvasContext: ctx, viewport: renderViewport })
			try {
				await task.promise
			} catch {
				/* cancelled */
			}
			if (token.cancelled) return

			tlContainer.innerHTML = ''
			tlContainer.style.width = `${cssViewport.width}px`
			tlContainer.style.height = `${cssViewport.height}px`
			tlContainer.style.setProperty('--scale-factor', String(SCALE))

			const textContent = await page.getTextContent()
			if (token.cancelled) return

			const textLayer = new pdfjs.TextLayer({
				textContentSource: textContent as never,
				container: tlContainer,
				viewport: cssViewport as never,
			})
			await textLayer.render()
			if (token.cancelled) return

			// Measure per-word rects via DOM Range — matches pdf.js font metrics.
			const containerRect = tlContainer.getBoundingClientRect()
			const spans = tlContainer.querySelectorAll<HTMLSpanElement>('span')
			const words: Word[] = []

			for (const span of spans) {
				const node = span.firstChild
				if (!node || node.nodeType !== Node.TEXT_NODE) continue
				const text = node.textContent ?? ''
				if (!text.trim()) continue

				let i = 0
				while (i < text.length) {
					while (i < text.length && /\s/.test(text[i])) i++
					if (i >= text.length) break
					const start = i
					while (i < text.length && !/\s/.test(text[i])) i++
					const end = i
					const tokenText = text.slice(start, end)

					const range = document.createRange()
					range.setStart(node, start)
					range.setEnd(node, end)
					const rect = range.getBoundingClientRect()

					words.push({
						text: tokenText,
						index: words.length,
						x: rect.left - containerRect.left,
						y: rect.top - containerRect.top,
						w: rect.width,
						h: rect.height,
					})
				}
			}

			if (Math.abs(pageNumber - currentPageRef.current) > RENDER_AHEAD + KEEP_BEHIND) {
				canvas.width = 0
				canvas.height = 0
				tlContainer.innerHTML = ''
				return
			}

			wordsRef.current = { ...wordsRef.current, [pageNumber]: words }
			setWordsByPage(wordsRef.current)
			renderedRef.current.add(pageNumber)
			setRendered((prev) => ({ ...prev, [pageNumber]: true }))

			const payload: PageText = {
				pageNumber,
				text: words.map((w) => w.text).join(' '),
				words,
			}
			if (pageNumber === currentPageRef.current) {
				lastScrolledRef.current = -1
				onPageReadyRef.current(payload)
			} else if (pageNumber === currentPageRef.current + 1) {
				onPrefetchPageReadyRef.current?.(payload)
			}
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: client diagnostic; swap for logger when a browser-safe one exists
			console.error('[PdfViewer] render error', err)
		} finally {
			renderingRef.current.delete(pageNumber)
			if (renderCancelsRef.current.get(pageNumber) === token) {
				renderCancelsRef.current.delete(pageNumber)
			}
		}
	}, [])

	const ensureWindow = useCallback(
		(pageNumber: number) => {
			for (
				let p = Math.max(1, pageNumber - 1);
				p <= Math.min(numPages, pageNumber + RENDER_AHEAD);
				p++
			) {
				if (!renderedRef.current.has(p)) void renderPage(p)
			}
			// Free canvases far from the viewport so large PDFs stay cheap.
			if (renderedRef.current.size > 6) {
				for (const p of Array.from(renderedRef.current)) {
					if (p === currentPageRef.current) continue
					if (p >= pageNumber - KEEP_BEHIND && p <= pageNumber + RENDER_AHEAD + 1) continue
					const shell = pageElsRef.current.get(p)
					const canvas = shell?.querySelector('canvas')
					const tl = shell?.querySelector<HTMLDivElement>('.pdf-textlayer')
					if (canvas) {
						canvas.width = 0
						canvas.height = 0
					}
					if (tl) tl.innerHTML = ''
					renderedRef.current.delete(p)
					setRendered((prev) => {
						if (!prev[p]) return prev
						const next = { ...prev }
						delete next[p]
						return next
					})
				}
			}
		},
		[numPages, renderPage],
	)

	const handleScroll = useCallback(() => {
		if (scrollRafRef.current) return
		scrollRafRef.current = requestAnimationFrame(() => {
			scrollRafRef.current = 0
			const scrollEl = scrollRef.current
			if (!scrollEl) return
			const anchor = scrollEl.getBoundingClientRect().top + scrollEl.clientHeight * 0.33
			const programmatic = Date.now() < programmaticScrollUntilRef.current
			setShowScrollTop(scrollEl.scrollTop > 360)

			let visible = reportedPageRef.current || 1
			for (const [p, el] of pageElsRef.current) {
				const rect = el.getBoundingClientRect()
				if (rect.top <= anchor && rect.bottom > anchor) {
					visible = p
					break
				}
			}

			ensureWindow(visible)
			if (audioActiveRef.current && currentPageRef.current !== visible) {
				// Keep the spoken page rendered while the reader browses elsewhere.
				if (!renderedRef.current.has(currentPageRef.current)) {
					void renderPage(currentPageRef.current)
				}
			}
			if (!programmatic && audioActiveRef.current) {
				// Browsing away from the spoken text pauses auto-follow until the
				// reader taps "Back to audio".
				followRef.current = false
			}
			refreshFloating()
			if (visible === reportedPageRef.current) return
			reportedPageRef.current = visible
			if (Date.now() < suppressReportUntilRef.current) return
			sentPageRef.current = visible
			onVisiblePageChangeRef.current?.(visible)
		})
	}, [ensureWindow, refreshFloating, renderPage])

	// A wheel/touch/drag means the reader is browsing away deliberately; stop
	// auto-following the spoken word immediately, before the scroll handler runs.
	useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		const onUserScroll = () => {
			if (!audioActiveRef.current) return
			followRef.current = false
			refreshFloating()
		}
		el.addEventListener('wheel', onUserScroll, { passive: true })
		el.addEventListener('touchmove', onUserScroll, { passive: true })
		el.addEventListener('pointerdown', onUserScroll)
		return () => {
			el.removeEventListener('wheel', onUserScroll)
			el.removeEventListener('touchmove', onUserScroll)
			el.removeEventListener('pointerdown', onUserScroll)
		}
	}, [refreshFloating])

	// Load PDF, size every page up front, then let the scroll window render them.
	useEffect(() => {
		if (!file) {
			pdfRef.current = null
			setNumPages(0)
			setSizes({})
			setWordsByPage({})
			setRendered({})
			wordsRef.current = {}
			renderedRef.current.clear()
			renderingRef.current.clear()
			pageElsRef.current.clear()
			return
		}
		let cancelled = false
		setLoading(true)
		setWordsByPage({})
		setRendered({})
		wordsRef.current = {}
		renderedRef.current.clear()
		pageElsRef.current.clear()

		;(async () => {
			const pdfjs = await import('pdfjs-dist')
			pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

			const buf = await file.arrayBuffer()
			const doc = await pdfjs.getDocument({ data: buf }).promise
			if (cancelled) return
			pdfRef.current = doc
			setNumPages(doc.numPages)
			onLoad(doc.numPages)

			const nextSizes: Record<number, CanvasSize> = {}
			for (let p = 1; p <= doc.numPages; p++) {
				const page = await doc.getPage(p)
				const viewport = page.getViewport({ scale: SCALE })
				nextSizes[p] = { cssW: viewport.width, cssH: viewport.height }
			}
			if (cancelled) return
			setSizes(nextSizes)
			setLoading(false)

			const startPage = initialPage && initialPage > 1 ? Math.min(initialPage, doc.numPages) : 1
			onPageChange(startPage)

			// Resolve PDF outline (bookmarks) → page numbers.
			if (onOutline) {
				try {
					const raw = await (
						doc as unknown as {
							getOutline: () => Promise<RawOutlineItem[] | null>
						}
					).getOutline()
					if (!cancelled) {
						const resolved = raw ? await resolveOutline(doc, raw) : []
						onOutline(resolved)
					}
				} catch (err) {
					// biome-ignore lint/suspicious/noConsole: client diagnostic; swap for logger when a browser-safe one exists
					console.warn('[PdfViewer] outline fetch failed', err)
					onOutline([])
				}
			}
		})().catch((err) => {
			// biome-ignore lint/suspicious/noConsole: client diagnostic; swap for logger when a browser-safe one exists
			console.error('[PdfViewer] load error', err)
			setLoading(false)
		})

		return () => {
			cancelled = true
			for (const token of renderCancelsRef.current.values()) token.cancelled = true
			renderCancelsRef.current.clear()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [file])

	// Scroll the viewport when navigation comes from outside (TOC, page controls, TTS).
	useEffect(() => {
		if (!numPages || !sizes[currentPage]) return
		if (reportedPageRef.current === currentPage) return
		const scrollEl = scrollRef.current
		const el = pageElsRef.current.get(currentPage)
		if (!scrollEl || !el) return
		reportedPageRef.current = currentPage
		sentPageRef.current = currentPage
		suppressReportUntilRef.current = Date.now() + 900
		programmaticScrollUntilRef.current = Date.now() + 900
		if (audioActiveRef.current) followRef.current = true
		const top =
			scrollEl.scrollTop +
			el.getBoundingClientRect().top -
			scrollEl.getBoundingClientRect().top -
			12
		scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
	}, [currentPage, numPages, sizes])

	// Render the window around the active page and report cached words to the app.
	useEffect(() => {
		if (!numPages || !sizes[currentPage]) return
		ensureWindow(currentPage)
	}, [currentPage, numPages, sizes, ensureWindow])

	useEffect(() => {
		const w = wordsByPage[currentPage]
		if (!w) return
		onPageReadyRef.current({
			pageNumber: currentPage,
			text: w.map((x) => x.text).join(' '),
			words: w,
		})
	}, [currentPage, wordsByPage])

	useEffect(() => {
		const w = wordsByPage[currentPage + 1]
		if (!w) return
		onPrefetchPageReadyRef.current?.({
			pageNumber: currentPage + 1,
			text: w.map((x) => x.text).join(' '),
			words: w,
		})
	}, [currentPage, wordsByPage])

	// Auto-scroll the container to keep the active word centered, unless the reader
	// has scrolled away. "Back to audio" turns following back on.
	useEffect(() => {
		if (!audioActive || !followRef.current) return
		if (currentWordIndex < 0 || currentWordIndex === lastScrolledRef.current) return
		const active = pageElsRef.current.get(currentPage)?.querySelector('.pdf-highlight')
		if (active) {
			programmaticScrollUntilRef.current = Date.now() + 900
			active.scrollIntoView({ behavior: 'smooth', block: 'center' })
			lastScrolledRef.current = currentWordIndex
		}
	}, [audioActive, currentWordIndex, currentPage, rendered])

	useEffect(() => {
		refreshFloating()
	}, [refreshFloating, audioActive, currentWordIndex, rendered])

	// When narration goes idle, resync the reading position with what is on screen.
	useEffect(() => {
		if (audioActive) return
		const scrollEl = scrollRef.current
		if (!scrollEl) return
		const anchor = scrollEl.getBoundingClientRect().top + scrollEl.clientHeight * 0.33
		for (const [p, el] of pageElsRef.current) {
			const rect = el.getBoundingClientRect()
			if (rect.top <= anchor && rect.bottom > anchor) {
				sentPageRef.current = p
				reportedPageRef.current = p
				onVisiblePageChangeRef.current?.(p)
				return
			}
		}
	}, [audioActive])

	const returnToAudio = useCallback(() => {
		followRef.current = true
		const el = pageElsRef.current
			.get(currentPageRef.current)
			?.querySelector('.pdf-highlight.visible')
		if (el) {
			programmaticScrollUntilRef.current = Date.now() + 1200
			el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		}
		setShowFollow(false)
	}, [])

	const scrollToTop = useCallback(() => {
		followRef.current = false
		programmaticScrollUntilRef.current = Date.now() + 900
		scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
	}, [])

	const activeWord =
		currentWordIndex >= 0 && currentWordIndex < pageWords.length
			? pageWords[currentWordIndex]
			: null
	const highlightVisible =
		!!activeWord &&
		activeWord.x != null &&
		activeWord.y != null &&
		activeWord.w != null &&
		activeWord.h != null

	const notesEnabled = !!onNoteAdd

	return (
		<div className="flex flex-col h-full">
			<div className="reader-pagebar">
				<button
					type="button"
					onClick={() => onPageChange(Math.max(1, currentPage - 1))}
					disabled={currentPage <= 1}
					className="btn-pill"
				>
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
					Prev
				</button>
				<div className="reader-page-count">
					<span>Page</span>
					<input
						type="number"
						min={1}
						max={numPages || 1}
						value={currentPage}
						onChange={(e) => {
							const n = Number(e.target.value)
							if (n >= 1 && n <= numPages) onPageChange(n)
						}}
						className="reader-page-input"
					/>
					<span className="reader-page-total">/ {numPages || '—'}</span>
				</div>
				<button
					type="button"
					onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
					disabled={currentPage >= numPages}
					className="btn-pill"
				>
					Next
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
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
				</button>
			</div>

			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="reader-scroll-area relative flex-1 overflow-auto px-6 pt-6"
				style={{ background: 'var(--bg)' }}
			>
				{loading && (
					<div
						className="absolute inset-0 z-10 flex items-center justify-center"
						style={{ color: 'var(--text-3)', background: 'var(--bg)' }}
					>
						Loading PDF…
					</div>
				)}

				<div className="pdf-pages mx-auto">
					{Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
						const size = sizes[p]
						const isActive = p === currentPage
						const words = isActive ? pageWords : (wordsByPage[p] ?? [])
						return (
							<div
								key={p}
								ref={(el) => {
									if (el) pageElsRef.current.set(p, el)
									else pageElsRef.current.delete(p)
									if (isActive) pageContainerRef.current = el
								}}
								data-page={p}
								className="pdf-page-shell"
								style={{
									width: size?.cssW || 620,
									height: size?.cssH || 840,
									marginBottom: PAGE_GAP,
								}}
							>
								<div
									className="relative shadow-lg rounded"
									style={{
										width: size?.cssW,
										height: size?.cssH,
										background: 'var(--surface)',
									}}
								>
									<canvas className="block rounded" />
									<div
										className="pdf-textlayer"
										aria-hidden="true"
										style={{ width: size?.cssW, height: size?.cssH }}
									/>

									{isActive && rendered[p] && (
										<div className="pdf-overlay" style={{ width: size?.cssW, height: size?.cssH }}>
											{words.map((word, i) => {
												if (word.x == null || word.y == null || word.w == null || word.h == null)
													return null
												const done = currentWordIndex >= 0 && i < currentWordIndex
												return (
													<span
														key={i}
														className={`pdf-word${done ? ' done' : ''}`}
														style={{
															left: word.x,
															top: word.y,
															width: word.w,
															height: word.h,
														}}
													/>
												)
											})}
											<div
												className={`pdf-highlight${highlightVisible ? ' visible' : ''}`}
												style={
													highlightVisible && activeWord
														? {
																left: activeWord.x,
																top: activeWord.y,
																width: activeWord.w,
																height: activeWord.h,
															}
														: undefined
												}
											/>
										</div>
									)}

									{/* Notes interaction layer (active page only) */}
									{isActive && rendered[p] && notesEnabled && size && size.cssW > 0 && (
										<div
											className="absolute inset-0 pdf-notes-layer"
											style={{ width: size.cssW, height: size.cssH }}
										>
											{lines.map((line, i) => {
												const lineH = Math.max(16, line.bottom - line.y)
												const lineNote = (notes ?? []).find((n) => Math.abs(n.lineY - line.y) < 10)
												const isHovered = hoveredLine?.y === line.y
												return (
													<div
														key={i}
														className="note-hover-zone"
														style={{ top: line.y, height: lineH }}
														onMouseEnter={() => {
															if (!editingLine) setHoveredLine(line)
														}}
													>
														{isHovered && !editingLine && !lineNote && (
															<button
																className="note-add-btn"
																style={{ height: lineH }}
																onClick={() => openNoteEditor(line)}
																title="Add note"
															>
																+
															</button>
														)}
													</div>
												)
											})}

											{(notes ?? []).map((note) => (
												<button
													key={note.id}
													className={`note-marker${highlightNoteId === note.id ? ' note-marker-highlight' : ''}`}
													style={{ top: note.lineY }}
													onClick={() => openExistingNote(note)}
													title={note.noteText}
												>
													<FaNotesMedical className="note-marker-icon" />
												</button>
											))}

											{editingLine && (
												<div
													className="note-editor-popover"
													style={popoverFixedStyle}
													onMouseEnter={() => setHoveredLine(null)}
												>
													<div className="note-editor-header">
														{editingNoteId ? 'Edit note' : 'Add note'}
													</div>
													<textarea
														ref={noteTextareaRef}
														value={noteText}
														onChange={(e) => setNoteText(e.target.value)}
														placeholder="Type your note…"
														className="note-editor-textarea"
														disabled={isSavingNote}
														onKeyDown={(e) => {
															if ((e.metaKey || e.ctrlKey) && e.key === 'Enter')
																void handleSaveNote()
															if (e.key === 'Escape') cancelNote()
														}}
													/>
													{noteError && <div className="note-editor-error">{noteError}</div>}
													<div className="note-editor-actions">
														{editingNoteId && (
															<button
																className="note-btn note-btn-delete"
																onClick={() => void handleDeleteNote()}
																disabled={isSavingNote}
															>
																Delete
															</button>
														)}
														<button
															className="note-btn note-btn-cancel"
															onClick={cancelNote}
															disabled={isSavingNote}
														>
															Cancel
														</button>
														<button
															className="note-btn note-btn-save"
															onClick={() => void handleSaveNote()}
															disabled={!noteText.trim() || isSavingNote}
														>
															{isSavingNote ? 'Saving...' : 'Save'}
														</button>
													</div>
													<div className="note-editor-hint">⌘↵ to save · Esc to cancel</div>
												</div>
											)}
										</div>
									)}

									{isActive && rendered[p] && !loading && words.length === 0 && noTextMessage && (
										<div
											className="absolute inset-0 flex items-center justify-center p-6 text-center"
											style={{
												color: 'var(--text-3)',
												background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
											}}
										>
											{noTextMessage}
										</div>
									)}

									{!rendered[p] && <div className="pdf-page-placeholder" />}
								</div>
							</div>
						)
					})}
				</div>
			</div>

			<div className="reader-float-stack">
				{showFollow && (
					<button
						type="button"
						className="follow-audio-btn"
						onClick={returnToAudio}
						title="Return to the spoken text"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M9 10 5 6l4-4M5 6h9a5 5 0 0 1 0 10h-3M5 21h14" />
						</svg>
						Back to audio
					</button>
				)}
				{showScrollTop && (
					<button
						type="button"
						className="scroll-top-btn"
						onClick={scrollToTop}
						title="Back to top"
						aria-label="Back to top"
					>
						<svg
							width="17"
							height="17"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.4"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
					</button>
				)}
			</div>
		</div>
	)
}
