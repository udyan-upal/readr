import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { type NextRequest, NextResponse } from 'next/server'
import { isWorkersRuntime, synthesizeOnWorkers } from '@/lib/edge-tts-worker'
import { isAuthorized, unauthorized } from '@/lib/require-user'
import type { WordBoundary } from '@/types'

// msedge-tts needs Node WebSocket — not compatible with the edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
	text?: string
	voice?: string
	rate?: string // e.g. "+0%", "+50%", "-25%"
}

// Microsoft returns offsets in HNS (100-nanosecond ticks).
const HNS_PER_MS = 10_000

export async function POST(req: NextRequest) {
	if (!(await isAuthorized(req))) return unauthorized()

	let body: Body
	try {
		body = await req.json()
	} catch {
		return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
	}

	const { text, voice, rate } = body
	if (!text || !text.trim()) {
		return NextResponse.json({ error: 'text is required' }, { status: 400 })
	}
	if (!voice) {
		return NextResponse.json({ error: 'voice is required' }, { status: 400 })
	}

	// msedge-tts cannot open its socket on Cloudflare Workers; use the native WebSocket path there.
	if (isWorkersRuntime()) {
		try {
			return NextResponse.json(await synthesizeOnWorkers(text, voice, rate ?? '+0%'))
		} catch (err) {
			return NextResponse.json(
				{ error: `Synthesis failed: ${(err as Error).message}` },
				{ status: 500 },
			)
		}
	}

	const tts = new MsEdgeTTS()

	try {
		await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
			wordBoundaryEnabled: true,
			sentenceBoundaryEnabled: false,
		})
	} catch (err) {
		return NextResponse.json(
			{ error: `Voice not found or setup failed: ${(err as Error).message}` },
			{ status: 400 },
		)
	}

	const boundaries: WordBoundary[] = []
	const audioChunks: Buffer[] = []

	try {
		const { audioStream, metadataStream } = tts.toStream(text, {
			rate: rate ?? '+0%',
		})

		metadataStream?.on('data', (chunk: Buffer) => {
			try {
				const obj = JSON.parse(chunk.toString()) as {
					Metadata?: Array<{
						Type: string
						Data: {
							Offset: number
							Duration: number
							text?: { Text?: string }
						}
					}>
				}
				if (!Array.isArray(obj.Metadata)) return
				for (const m of obj.Metadata) {
					if (m.Type !== 'WordBoundary') continue
					boundaries.push({
						text: m.Data.text?.Text ?? '',
						offsetMs: m.Data.Offset / HNS_PER_MS,
						durationMs: m.Data.Duration / HNS_PER_MS,
					})
				}
			} catch {
				// Ignore parse errors on individual chunks.
			}
		})

		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('TTS timeout after 60s')), 60_000)
			audioStream.on('data', (c: Buffer) => audioChunks.push(c))
			audioStream.on('end', () => {
				clearTimeout(timeout)
				resolve()
			})
			audioStream.on('close', () => {
				clearTimeout(timeout)
				resolve()
			})
			audioStream.on('error', (err: Error) => {
				clearTimeout(timeout)
				reject(err)
			})
		})
	} catch (err) {
		return NextResponse.json(
			{ error: `Synthesis failed: ${(err as Error).message}` },
			{ status: 500 },
		)
	} finally {
		try {
			tts.close()
		} catch {
			// best effort
		}
	}

	if (audioChunks.length === 0) {
		return NextResponse.json({ error: 'No audio produced' }, { status: 500 })
	}

	const audio = Buffer.concat(audioChunks).toString('base64')
	return NextResponse.json({ audio, boundaries })
}
