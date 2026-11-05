import { safeEqual, verifySessionToken } from '@/lib/session-token'

/** A Response body is single-use, so each 401 must be a fresh instance. */
export const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

function bearerToken(req: Request): string | null {
	const header = req.headers.get('authorization')
	return header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
}

/** Returns the caller's user id, or null when the token is missing or invalid. */
export async function getUserId(req: Request): Promise<string | null> {
	const token = bearerToken(req)
	return token ? verifySessionToken(token) : null
}

/**
 * Like getUserId, but also accepts the static EXT_API_TOKEN so the browser
 * extension can call the API without an interactive login.
 */
export async function isAuthorized(req: Request): Promise<boolean> {
	const token = bearerToken(req)
	if (!token) return false
	const extToken = process.env.EXT_API_TOKEN
	if (extToken && (await safeEqual(token, extToken))) return true
	return (await verifySessionToken(token)) !== null
}
