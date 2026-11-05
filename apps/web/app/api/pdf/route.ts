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

/** Deletes a stored PDF plus its notes and saved reading position. */
export async function DELETE(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const path = new URL(req.url).searchParams.get('path')
	if (!path?.startsWith(`${userId}/`)) {
		return Response.json({ error: 'Not found' }, { status: 404 })
	}

	const { BUCKET, DB } = bindings()

	// Notes and the saved position are meaningless without the file, so drop them too.
	await DB.prepare('DELETE FROM pdf_notes WHERE user_id = ? AND pdf_path = ?')
		.bind(userId, path)
		.run()
	await DB.prepare('DELETE FROM reading_sessions WHERE user_id = ? AND pdf_path = ?')
		.bind(userId, path)
		.run()
	await BUCKET.delete(path)

	return Response.json({ deleted: path })
}
