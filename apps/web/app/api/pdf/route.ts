import { bindings } from '@/lib/cf'
import { getUserId, unauthorized } from '@/lib/require-user'

export const runtime = 'nodejs'

/** Streams a stored PDF. Keys are `<userId>/<file>`, so a user can only read their own. */
export async function GET(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const path = new URL(req.url).searchParams.get('path')
	if (!path?.startsWith(`${userId}/`)) {
		return Response.json({ error: 'Not found' }, { status: 404 })
	}

	const object = await bindings().BUCKET.get(path)
	if (!object) return Response.json({ error: 'Not found' }, { status: 404 })

	return new Response(object.body, {
		headers: {
			'content-type': 'application/pdf',
			'content-length': String(object.size),
			'cache-control': 'private, max-age=0',
		},
	})
}
