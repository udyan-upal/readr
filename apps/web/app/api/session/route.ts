import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function GET(req: Request) {
	const { userId } = await auth()
	if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

	const { searchParams } = new URL(req.url)
	const path = searchParams.get('path')
	if (!path) return Response.json({ session: null })

	const supabase = createAdminClient()
	const { data } = await supabase
		.from('reading_sessions')
		.select('*')
		.eq('user_id', userId)
		.eq('pdf_path', path)
		.single()

	return Response.json({ session: data ?? null })
}

export async function POST(req: Request) {
	const { userId } = await auth()
	if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

	const body = (await req.json()) as {
		path: string
		name: string
		page: number
		wordIndex: number
		voice: string
		rate: string
	}

	const supabase = createAdminClient()
	await supabase.from('reading_sessions').upsert(
		{
			user_id: userId,
			pdf_path: body.path,
			pdf_name: body.name,
			current_page: body.page,
			word_index: body.wordIndex,
			voice: body.voice,
			rate: body.rate,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: 'user_id,pdf_path' },
	)

	return Response.json({ ok: true })
}
