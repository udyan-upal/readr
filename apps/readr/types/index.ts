export interface Word {
	text: string
	index: number
	offsetMs?: number
	durationMs?: number
	// CSS-space canvas coords (optional — absent for scanned/no-position items).
	x?: number
	y?: number
	w?: number
	h?: number
}

export interface WordBoundary {
	text: string
	offsetMs: number
	durationMs: number
}

export interface PageText {
	pageNumber: number
	text: string
	words: Word[]
}

export interface Voice {
	shortName: string
	friendlyName: string
	gender: string // "Male" | "Female" | "Neutral" — widened for upstream variants
	locale: string
}

export interface TtsResponse {
	audio: string
	boundaries: WordBoundary[]
}

export interface OutlineItem {
	title: string
	pageNumber?: number
	items: OutlineItem[]
}

export interface PdfNote {
	id: string
	pageNumber: number
	noteText: string
	lineY: number
	wordIndex: number
	createdAt: string
}
