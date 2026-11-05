import { bindings } from '@/lib/cf'
import { getUserId, unauthorized } from '@/lib/require-user'

export const runtime = 'nodejs'

function toInt(value: unknown): number | null {
	const n = Number(value)
	if (!Number.isFinite(n)) return null
	return Math.trunc(n)
}

function toRoundedInt(value: unknown): number | null {
	const n = Number(value)
	if (!Number.isFinite(n)) return null
	return Math.round(n)
}

export async function GET(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const { searchParams } = new URL(req.url)
	const path = searchParams.get('path')
	const page = searchParams.get('page')
	if (!path) return Response.json({ notes: [] })

	const { DB } = bindings()

	if (!page) {
		// Return all notes for this PDF across all pages
		const { results } = await DB.prepare(
			'SELECT * FROM pdf_notes WHERE user_id = ? AND pdf_path = ? ORDER BY page_number, line_y',
		)
			.bind(userId, path)
			.all()
		return Response.json({ notes: results })
	}

	const pageNumber = toInt(page)
	if (pageNumber == null || pageNumber < 1) return Response.json({ notes: [] })

	const { results } = await DB.prepare(
		'SELECT * FROM pdf_notes WHERE user_id = ? AND pdf_path = ? AND page_number = ? ORDER BY line_y',
	)
		.bind(userId, path, pageNumber)
		.all()
	return Response.json({ notes: results })
}

export async function POST(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const body = (await req.json()) as {
		path: string
		pageNumber: number
		noteText: string
		lineY: number
		wordIndex: number
	}

	const path = typeof body.path === 'string' ? body.path : ''
	const pageNumber = toInt(body.pageNumber)
	const noteText = typeof body.noteText === 'string' ? body.noteText.trim() : ''
	const lineY = toRoundedInt(body.lineY)
	const wordIndex = toInt(body.wordIndex)

	if (
		!path ||
		pageNumber == null ||
		pageNumber < 1 ||
		!noteText ||
		lineY == null ||
		wordIndex == null ||
		wordIndex < 0
	) {
		return Response.json({ error: 'Invalid note payload' }, { status: 400 })
	}

	const { DB } = bindings()
	const id = crypto.randomUUID()
	await DB.prepare(
		'INSERT INTO pdf_notes (id, user_id, pdf_path, page_number, note_text, line_y, word_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
	)
		.bind(id, userId, path, pageNumber, noteText, lineY, wordIndex)
		.run()
	const note = await DB.prepare('SELECT * FROM pdf_notes WHERE id = ?').bind(id).first()
	return Response.json({ note })
}

export async function PATCH(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const { searchParams } = new URL(req.url)
	const id = searchParams.get('id')
	if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

	const body = (await req.json()) as { noteText: string }
	const noteText = typeof body.noteText === 'string' ? body.noteText.trim() : ''
	if (!noteText) return Response.json({ error: 'Note text is required' }, { status: 400 })
	const { DB } = bindings()
	const note = await DB.prepare(
		'UPDATE pdf_notes SET note_text = ? WHERE id = ? AND user_id = ? RETURNING *',
	)
		.bind(noteText, id, userId)
		.first()
	if (!note) return Response.json({ error: 'Note not found' }, { status: 404 })
	return Response.json({ note })
}

export async function DELETE(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const { searchParams } = new URL(req.url)
	const id = searchParams.get('id')
	if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

	await bindings()
		.DB.prepare('DELETE FROM pdf_notes WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.run()
	return Response.json({ ok: true })
}
