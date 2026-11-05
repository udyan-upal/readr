import { getUserId, unauthorized } from '@/lib/require-user'

export const runtime = 'nodejs'

export async function GET(req: Request) {
	const id = await getUserId(req)
	if (!id) return unauthorized()
	return Response.json({ user: { id, email: id, name: id } })
}
