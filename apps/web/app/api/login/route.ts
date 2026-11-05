import { ADMIN_ID, safeEqual, signSessionToken } from '@/lib/session-token'

export const runtime = 'nodejs'

export async function POST(req: Request) {
	const body = (await req.json().catch(() => null)) as {
		username?: string
		password?: string
	} | null

	const expectedUser = process.env.ADMIN_USERNAME
	const expectedPass = process.env.ADMIN_PASSWORD
	if (!expectedUser || !expectedPass) {
		return Response.json({ error: 'Login is not configured' }, { status: 500 })
	}

	const userOk = await safeEqual(body?.username ?? '', expectedUser)
	const passOk = await safeEqual(body?.password ?? '', expectedPass)
	if (!userOk || !passOk) {
		// Slow down guessing; wall-clock sleep does not count against Workers CPU time.
		await new Promise((resolve) => setTimeout(resolve, 750))
		return Response.json({ message: 'Incorrect username or password.' }, { status: 401 })
	}

	return Response.json({ token: await signSessionToken(ADMIN_ID) })
}
