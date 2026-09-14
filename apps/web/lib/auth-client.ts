'use client'

/**
 * Thin client for the bearer-only auth service (apps/auth).
 *
 * Two tokens are in play:
 *   - session token — long-lived minting credential, returned in the
 *     `set-auth-token` response header. Killed by sign-out.
 *   - access token  — short-lived JWE minted from the session token and sent
 *     as `Authorization: Bearer` to this app's own /api routes.
 *
 * The session token lives in localStorage: the auth service never sets cookies,
 * so there is no httpOnly option. Any injected script can read it.
 */

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3000'
const SESSION_KEY = 'readr.session-token'
// Re-mint this long before the 15-minute expiry rather than racing it.
const ACCESS_TOKEN_TTL_MS = 10 * 60 * 1000

export interface AuthUser {
	id: string
	email: string
	name: string
}

let accessToken: { value: string; expiresAt: number } | null = null

export function getSessionToken(): string | null {
	try {
		return localStorage.getItem(SESSION_KEY)
	} catch {
		return null
	}
}

function setSessionToken(token: string | null): void {
	accessToken = null
	try {
		if (token) localStorage.setItem(SESSION_KEY, token)
		else localStorage.removeItem(SESSION_KEY)
	} catch {
		// private mode / blocked storage — the session simply will not persist
	}
}

async function post(path: string, body: unknown): Promise<Response> {
	return fetch(`${AUTH_URL}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

/** Better Auth returns its failure detail as { message } with a 4xx status. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { message?: string }
		return body.message || fallback
	} catch {
		return fallback
	}
}

async function captureSession(res: Response): Promise<void> {
	const token = res.headers.get('set-auth-token')
	if (!token) {
		throw new Error(
			'Auth service returned no session token. Check that CORS exposes the set-auth-token header.',
		)
	}
	setSessionToken(token)
}

export async function signUp(input: {
	email: string
	name: string
	password: string
}): Promise<void> {
	const res = await post('/api/auth/sign-up/email', input)
	if (!res.ok) throw new Error(await errorMessage(res, 'Could not create that account.'))
	await captureSession(res)
}

export async function signIn(input: { email: string; password: string }): Promise<void> {
	const res = await post('/api/auth/sign-in/email', input)
	if (!res.ok) throw new Error(await errorMessage(res, 'Incorrect email or password.'))
	await captureSession(res)
}

export async function signOut(): Promise<void> {
	const token = getSessionToken()
	if (token) {
		// Best-effort: a failed revoke must not strand the user signed in locally.
		await post('/api/auth/sign-out', {}).catch(() => undefined)
	}
	setSessionToken(null)
}

/** Resolves the signed-in user, or null when there is no usable session. */
export async function fetchUser(): Promise<AuthUser | null> {
	const token = getSessionToken()
	if (!token) return null

	const res = await fetch(`${AUTH_URL}/api/auth/get-session`, {
		headers: { authorization: `Bearer ${token}` },
	})
	if (!res.ok) {
		setSessionToken(null)
		return null
	}
	const body = (await res.json()) as { user?: AuthUser } | null
	if (!body?.user) {
		setSessionToken(null)
		return null
	}
	return body.user
}

/** Mints (and caches) the short-lived JWE used against this app's own API. */
export async function getAccessToken(): Promise<string | null> {
	if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.value

	const sessionToken = getSessionToken()
	if (!sessionToken) return null

	const res = await fetch(`${AUTH_URL}/api/auth/token`, {
		headers: { authorization: `Bearer ${sessionToken}` },
	})
	if (!res.ok) {
		setSessionToken(null)
		return null
	}
	const { token } = (await res.json()) as { token: string }
	accessToken = { value: token, expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS }
	return token
}

/** Drops the cached JWE so the next call mints a fresh one. */
export function invalidateAccessToken(): void {
	accessToken = null
}
