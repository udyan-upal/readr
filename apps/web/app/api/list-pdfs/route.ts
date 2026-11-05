import { bindings } from '@/lib/cf'
import { getUserId, unauthorized } from '@/lib/require-user'

export const runtime = 'nodejs'

interface SessionRow {
	pdf_path: string
	current_page: number
	word_index: number
	voice: string | null
	rate: string | null
}

export async function GET(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const { BUCKET, DB } = bindings()

	const objects = []
	let cursor: string | undefined
	do {
		const page = await BUCKET.list({ prefix: `${userId}/`, cursor })
		objects.push(...page.objects)
		cursor = page.truncated ? page.cursor : undefined
	} while (cursor)
	objects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())

	const { results: sessions } = await DB.prepare(
		'SELECT pdf_path, current_page, word_index, voice, rate FROM reading_sessions WHERE user_id = ?',
	)
		.bind(userId)
		.all<SessionRow>()
	const sessionMap = new Map(sessions.map((s) => [s.pdf_path, s]))

	const files = objects.map((o) => {
		const session = sessionMap.get(o.key)
		return {
			name: o.key.slice(userId.length + 1).replace(/^\d+-/, ''),
			path: o.key,
			url: `/api/pdf?path=${encodeURIComponent(o.key)}`,
			createdAt: o.uploaded.toISOString(),
			lastPage: session?.current_page ?? null,
			wordIndex: session?.word_index ?? null,
			voice: session?.voice ?? null,
			rate: session?.rate ?? null,
		}
	})

	return Response.json({ files })
}
