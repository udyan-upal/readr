import { jwtDecrypt } from 'jose'

/**
 * Verifies the `Authorization: Bearer <JWE>` header minted by apps/auth.
 * Stateless: decrypt with the shared key and check exp/iss/aud. No network hop,
 * no database lookup — the same contract apps/auth's own bearer middleware uses.
 */

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3000'

function encryptionKey(): Uint8Array {
	const raw = process.env.JWT_ENCRYPTION_KEY
	if (!raw) {
		throw new Error('JWT_ENCRYPTION_KEY is not set; it must byte-match the auth service key')
	}
	const key = new Uint8Array(Buffer.from(raw, 'base64'))
	if (key.byteLength !== 32) {
		throw new Error(`JWT_ENCRYPTION_KEY must decode to 32 bytes, got ${key.byteLength}`)
	}
	return key
}

/** A Response body is single-use, so each 401 must be a fresh instance. */
export const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

/** Returns the caller's user id, or null when the token is missing or invalid. */
export async function getUserId(req: Request): Promise<string | null> {
	const header = req.headers.get('authorization')
	const token = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
	if (!token) return null

	try {
		const { payload } = await jwtDecrypt(token, encryptionKey(), {
			issuer: AUTH_URL,
			audience: AUTH_URL,
		})
		return typeof payload.sub === 'string' ? payload.sub : null
	} catch {
		return null
	}
}
