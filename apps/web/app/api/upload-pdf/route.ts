import { bindings } from '@/lib/cf'
import { getUserId, unauthorized } from '@/lib/require-user'

export const runtime = 'nodejs'

export async function POST(req: Request) {
	const userId = await getUserId(req)
	if (!userId) return unauthorized()

	const formData = await req.formData()
	const file = formData.get('file') as File | null
	if (!file) {
		return Response.json({ error: 'No file provided' }, { status: 400 })
	}

	const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
	await bindings().BUCKET.put(path, await file.arrayBuffer(), {
		httpMetadata: { contentType: 'application/pdf' },
	})

	return Response.json({ path })
}
