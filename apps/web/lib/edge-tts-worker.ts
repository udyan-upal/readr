import { hashSecMsGecV2 } from 'msedge-tts/dist/SecMsGec'
import type { WordBoundary } from '@/types'

/**
 * Edge TTS over a runtime-native WebSocket, for Cloudflare Workers where
 * `msedge-tts` (built on Node's `ws`/`http`) cannot open a connection.
 * Outbound WebSockets on Workers go through fetch() with an Upgrade header.
 */

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const WSS = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const HNS_PER_MS = 10_000
const TIMEOUT_MS = 60_000

export const isWorkersRuntime = () =>
	typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined'

interface WorkerWebSocket {
	accept(): void
	send(data: string): void
	close(): void
	addEventListener(type: string, cb: (e: { data?: string | ArrayBuffer | Blob }) => void): void
}

const xmlEscape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Binary frame: 2-byte big-endian header length, headers, then audio bytes. */
function audioPayload(data: ArrayBuffer): Uint8Array | null {
	const headerLen = new DataView(data).getUint16(0)
	const headers = new TextDecoder().decode(new Uint8Array(data, 2, headerLen))
	return headers.includes('Path:audio') ? new Uint8Array(data, 2 + headerLen) : null
}

const randomHex = () =>
	Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
		b.toString(16).padStart(2, '0'),
	).join('')

async function connect(): Promise<WorkerWebSocket> {
	const ticks = Math.floor(Date.now() / 1000) + 11644473600
	const windowsTicks = (ticks - (ticks % 300)) * 10_000_000
	const gec = await hashSecMsGecV2(`${windowsTicks}${TOKEN}`)
	const url = `${WSS}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${randomHex()}`

	const res = await fetch(url, {
		headers: {
			Upgrade: 'websocket',
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
			Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
		},
	})
	const ws = (res as unknown as { webSocket?: WorkerWebSocket }).webSocket
	if (!ws) throw new Error(`Edge TTS handshake failed (HTTP ${res.status})`)
	ws.accept()
	return ws
}

export async function synthesizeOnWorkers(
	text: string,
	voice: string,
	rate: string,
): Promise<{ audio: string; boundaries: WordBoundary[] }> {
	const locale = /\b[a-z]{2,}-[A-Z]{2}\b/.exec(voice)?.[0]
	if (!locale) throw new Error(`Could not infer locale from voice "${voice}"`)

	const ws = await connect()
	const requestId = randomHex()
	const audioChunks: Uint8Array[] = []
	const boundaries: WordBoundary[] = []
	// workerd delivers binary frames as Blobs; keep arrival order while they resolve.
	const frames: Array<Promise<Uint8Array | null>> = []

	const done = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('TTS timeout after 60s')), TIMEOUT_MS)
		const finish = (err?: Error) => {
			clearTimeout(timer)
			if (err) reject(err)
			else resolve()
		}

		ws.addEventListener('message', (e) => {
			const data = e.data
			if (typeof data === 'string') {
				if (data.includes('Path:turn.end')) return finish()
				if (data.includes('Path:audio.metadata')) {
					try {
						const json = JSON.parse(data.slice(data.indexOf('\r\n\r\n') + 4)) as {
							Metadata?: Array<{
								Type: string
								Data: { Offset: number; Duration: number; text?: { Text?: string } }
							}>
						}
						for (const m of json.Metadata ?? []) {
							if (m.Type !== 'WordBoundary') continue
							boundaries.push({
								text: m.Data.text?.Text ?? '',
								offsetMs: m.Data.Offset / HNS_PER_MS,
								durationMs: m.Data.Duration / HNS_PER_MS,
							})
						}
					} catch {
						// ignore malformed metadata frames
					}
				}
				return
			}
			if (data instanceof Blob) {
				frames.push(data.arrayBuffer().then(audioPayload))
			} else if (data instanceof ArrayBuffer) {
				frames.push(Promise.resolve(audioPayload(data)))
			}
		})
		ws.addEventListener('close', () => finish(new Error('Edge TTS closed before turn.end')))
		ws.addEventListener('error', () => finish(new Error('Edge TTS WebSocket error')))
	})
	// Swallow the late "closed" rejection after a normal finish.
	done.catch(() => undefined)

	const ts = new Date().toISOString()
	ws.send(
		`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
			JSON.stringify({
				context: {
					synthesis: {
						audio: {
							metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
							outputFormat: OUTPUT_FORMAT,
						},
					},
				},
			}),
	)
	ws.send(
		`X-RequestId:${requestId}\r\nX-Timestamp:${ts}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
			`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">` +
			`<voice name="${xmlEscape(voice)}"><prosody pitch="+0Hz" rate="${xmlEscape(rate)}" volume="100">${xmlEscape(text)}</prosody></voice></speak>`,
	)

	try {
		await done
	} finally {
		try {
			ws.close()
		} catch {
			// best effort
		}
	}

	for (const chunk of await Promise.all(frames)) if (chunk) audioChunks.push(chunk)
	if (audioChunks.length === 0) throw new Error('No audio produced')
	const total = audioChunks.reduce((n, c) => n + c.byteLength, 0)
	const merged = new Uint8Array(total)
	let offset = 0
	for (const c of audioChunks) {
		merged.set(c, offset)
		offset += c.byteLength
	}
	let bin = ''
	for (let i = 0; i < merged.length; i += 0x8000) {
		bin += String.fromCharCode(...merged.subarray(i, i + 0x8000))
	}
	return { audio: btoa(bin), boundaries }
}
