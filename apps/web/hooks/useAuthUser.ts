'use client'

import { useCallback, useEffect, useState } from 'react'
import { type AuthUser, fetchUser, signOut as revokeSession } from '@/lib/auth-client'

/** Mirrors the shape the page previously got from Clerk's useUser(). */
export function useAuthUser() {
	const [user, setUser] = useState<AuthUser | null>(null)
	const [isLoaded, setIsLoaded] = useState(false)

	const refresh = useCallback(async () => {
		const next = await fetchUser().catch(() => null)
		setUser(next)
		setIsLoaded(true)
	}, [])

	useEffect(() => {
		void refresh()
	}, [refresh])

	const signOut = useCallback(async () => {
		await revokeSession()
		setUser(null)
	}, [])

	return { user, isLoaded, isSignedIn: !!user, refresh, signOut }
}
