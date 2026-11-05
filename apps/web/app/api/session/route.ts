import { bindings } from '@/lib/cf'
import { getUserId, unauthorized } from '@/lib/require-user'

export const runtime = 'nodejs'

export async function GET(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const { searchParams } = new URL(req.url)
	const path = searchParams.get('path')
	if (!path) return Response.json({ session: null })

	const session = await bindings()
		.DB.prepare('SELECT * FROM reading_sessions WHERE user_id = ? AND pdf_path = ?')
		.bind(userId, path)
		.first()

	return Response.json({ session })
}

export async function POST(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const body = (await req.json()) as {
		path: string
		name: string
		page: number
		wordIndex: number
		voice: string
		rate: string
	}

	await bindings()
		.DB.prepare(
			`INSERT INTO reading_sessions
				(user_id, pdf_path, pdf_name, current_page, word_index, voice, rate, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (user_id, pdf_path) DO UPDATE SET
				pdf_name = excluded.pdf_name,
				current_page = excluded.current_page,
				word_index = excluded.word_index,
				voice = excluded.voice,
				rate = excluded.rate,
				updated_at = excluded.updated_at`,
		)
		.bind(
			userId,
			body.path,
			body.name,
			body.page,
			body.wordIndex,
			body.voice,
			body.rate,
			new Date().toISOString(),
		)
		.run()

	return Response.json({ ok: true })
}
