import type { Word } from '@/types'

export interface TtsChunk {
	text: string
	wordStart: number
	wordEnd: number
}

/**
 * Progressive chunking, matching the extension reader: the first clip is tiny so
 * playback starts fast, and every clip stays short because the Worker has a tight
 * CPU budget per request — small clips fail less and are cheap to retry.
 */
const TARGETS = [100, 250, 400]
const SENTENCE_END = /[.!?]["'”’)\]]*$/

export function buildProgressiveChunks(words: Word[], startIndex = 0): TtsChunk[] {
	const chunks: TtsChunk[] = []
	let i = Math.max(0, Math.min(startIndex, Math.max(0, words.length - 1)))
	while (i < words.length) {
		const target = TARGETS[Math.min(chunks.length, TARGETS.length - 1)]
		let end = i
		let length = 0
		let sentenceEnd = -1

		while (end < words.length) {
			const addition = words[end].text.length + (end > i ? 1 : 0)
			if (length + addition > target) break
			length += addition
			if (length >= target * 0.7 && SENTENCE_END.test(words[end].text)) sentenceEnd = end
			end++
		}

		if (end < words.length && sentenceEnd >= i) end = sentenceEnd + 1
		if (end === i) end = i + 1

		const text = words
			.slice(i, end)
			.map((w) => w.text)
			.join(' ')
			.trim()
		if (text) chunks.push({ text, wordStart: i, wordEnd: end - 1 })
		i = end
	}
	return chunks
}
