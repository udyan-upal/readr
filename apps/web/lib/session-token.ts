import { jwtVerify, SignJWT } from 'jose'

/**
 * Single-user auth: the token is an HS256 JWT signed with AUTH_SECRET.
 * Stateless — no database or auth service involved.
 */

const ISSUER = 'readr'
const TTL = '30d'

export const ADMIN_ID = 'admin'

function signingKey(): Uint8Array {
	const secret = process.env.AUTH_SECRET
	if (!secret || secret.length < 32) {
		throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters')
	}
	return new TextEncoder().encode(secret)
}

export async function signSessionToken(userId: string): Promise<string> {
	return new SignJWT({})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(userId)
		.setIssuer(ISSUER)
		.setIssuedAt()
		.setExpirationTime(TTL)
		.sign(signingKey())
}

export async function verifySessionToken(token: string): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, signingKey(), {
			issuer: ISSUER,
			algorithms: ['HS256'],
		})
		return typeof payload.sub === 'string' ? payload.sub : null
	} catch {
		return null
	}
}

/** Constant-time string compare: hash both sides so length never leaks. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
	const enc = new TextEncoder()
	const [ha, hb] = await Promise.all([
		crypto.subtle.digest('SHA-256', enc.encode(a)),
		crypto.subtle.digest('SHA-256', enc.encode(b)),
	])
	const va = new Uint8Array(ha)
	const vb = new Uint8Array(hb)
	let diff = 0
	for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
	return diff === 0
}
