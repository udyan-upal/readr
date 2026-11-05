'use client'

/**
 * Thin client for the single-user login (/api/login).
 *
 * The signed token lives in localStorage and is sent as `Authorization: Bearer`
 * to this app's own /api routes. Any injected script can read it.
 */

const SESSION_KEY = 'readr.session-token'

export interface AuthUser {
	id: string
	email: string
	name: string
}

export function getSessionToken(): string | null {
	try {
		return localStorage.getItem(SESSION_KEY)
	} catch {
		return null
	}
}

function setSessionToken(token: string | null): void {
	try {
		if (token) localStorage.setItem(SESSION_KEY, token)
		else localStorage.removeItem(SESSION_KEY)
	} catch {
		// private mode / blocked storage — the session simply will not persist
	}
}

export async function signIn(input: { username: string; password: string }): Promise<void> {
	const res = await fetch('/api/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { message?: string } | null
		throw new Error(body?.message || 'Incorrect username or password.')
	}
	const { token } = (await res.json()) as { token: string }
	setSessionToken(token)
}

export async function signOut(): Promise<void> {
	setSessionToken(null)
}

/** Resolves the signed-in user, or null when there is no usable session. */
export async function fetchUser(): Promise<AuthUser | null> {
	const token = getSessionToken()
	if (!token) return null

	const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } })
	if (!res.ok) {
		if (res.status === 401) setSessionToken(null)
		return null
	}
	const body = (await res.json()) as { user?: AuthUser }
	return body.user ?? null
}

export async function getAccessToken(): Promise<string | null> {
	return getSessionToken()
}

/** Kept for apiFetch: a 401 means the stored token is dead, so drop it. */
export function invalidateAccessToken(): void {
	setSessionToken(null)
}
