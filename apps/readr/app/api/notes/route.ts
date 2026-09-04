import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/utils/supabase/admin'

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
	const { userId } = await auth()
	if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

	const { searchParams } = new URL(req.url)
	const path = searchParams.get('path')
	const page = searchParams.get('page')
	if (!path) return Response.json({ notes: [] })

	const supabase = createAdminClient()

	if (!page) {
		// Return all notes for this PDF across all pages
		const { data, error } = await supabase
			.from('pdf_notes')
			.select('*')
			.eq('user_id', userId)
			.eq('pdf_path', path)
			.order('page_number', { ascending: true })
			.order('line_y', { ascending: true })
		if (error) return Response.json({ error: error.message }, { status: 500 })
		return Response.json({ notes: data ?? [] })
	}

	const pageNumber = toInt(page)
	if (pageNumber == null || pageNumber < 1) return Response.json({ notes: [] })

	const { data, error } = await supabase
		.from('pdf_notes')
		.select('*')
		.eq('user_id', userId)
		.eq('pdf_path', path)
		.eq('page_number', pageNumber)
		.order('line_y', { ascending: true })

	if (error) return Response.json({ error: error.message }, { status: 500 })
	return Response.json({ notes: data ?? [] })
}

export async function POST(req: Request) {
	const { userId } = await auth()
	if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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

	const supabase = createAdminClient()
	const { data, error } = await supabase
		.from('pdf_notes')
		.insert({
			user_id: userId,
			pdf_path: path,
			page_number: pageNumber,
			note_text: noteText,
			line_y: lineY,
			word_index: wordIndex,
		})
		.select()
		.single()

	if (error) return Response.json({ error: error.message }, { status: 500 })
	return Response.json({ note: data })
}

export async function PATCH(req: Request) {
	const { userId } = await auth()
	if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

	const { searchParams } = new URL(req.url)
	const id = searchParams.get('id')
	if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

	const body = (await req.json()) as { noteText: string }
	const noteText = typeof body.noteText === 'string' ? body.noteText.trim() : ''
	if (!noteText) return Response.json({ error: 'Note text is required' }, { status: 400 })
	const supabase = createAdminClient()
	const { data, error } = await supabase
		.from('pdf_notes')
		.update({ note_text: noteText })
		.eq('id', id)
		.eq('user_id', userId)
		.select()
		.single()

	if (error) return Response.json({ error: error.message }, { status: 500 })
	return Response.json({ note: data })
}

export async function DELETE(req: Request) {
	const { userId } = await auth()
	if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

	const { searchParams } = new URL(req.url)
	const id = searchParams.get('id')
	if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

	const supabase = createAdminClient()
	const { error } = await supabase.from('pdf_notes').delete().eq('id', id).eq('user_id', userId)

	if (error) return Response.json({ error: error.message }, { status: 500 })
	return Response.json({ ok: true })
}
