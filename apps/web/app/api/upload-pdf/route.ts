import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
	const { userId } = await auth()
	if (!userId) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const formData = await req.formData()
	const file = formData.get('file') as File | null
	if (!file) {
		return Response.json({ error: 'No file provided' }, { status: 400 })
	}

	const supabase = createAdminClient()

	const ext = file.name.split('.').pop() ?? 'pdf'
	const storagePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
	const buffer = await file.arrayBuffer()

	const { data, error } = await supabase.storage.from('pdfs').upload(storagePath, buffer, {
		contentType: `application/${ext}`,
		upsert: false,
	})

	if (error) {
		return Response.json({ error: error.message }, { status: 500 })
	}

	return Response.json({ path: data.path })
}
