'use client'

import { getAccessToken, invalidateAccessToken } from '@/lib/auth-client'

/**
 * fetch() against this app's own /api routes with the JWE attached.
 * A 401 means the token expired mid-flight, so it re-mints once and retries.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
	const send = async () => {
		const token = await getAccessToken()
		const headers = new Headers(init.headers)
		if (token) headers.set('authorization', `Bearer ${token}`)
		return fetch(input, { ...init, headers })
	}

	const res = await send()
	if (res.status !== 401) return res

	invalidateAccessToken()
	return send()
}
