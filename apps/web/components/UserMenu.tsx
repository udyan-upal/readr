'use client'

import type { AuthUser } from '@/lib/auth-client'

/** Replaces Clerk's <UserButton />: the user's initial plus a sign-out action. */
export function UserMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
	const initial = (user.name || user.email).charAt(0).toUpperCase()

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
			<div
				title={user.email}
				style={{
					width: 30,
					height: 30,
					borderRadius: '50%',
					background: 'var(--accent)',
					color: '#fff',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 13,
					fontWeight: 600,
					flexShrink: 0,
				}}
			>
				{initial}
			</div>
			<button
				type="button"
				onClick={onSignOut}
				style={{
					background: 'none',
					border: '1px solid var(--border)',
					borderRadius: 8,
					padding: '5px 10px',
					color: 'var(--text-2)',
					fontSize: 13,
					cursor: 'pointer',
					fontFamily: 'inherit',
				}}
			>
				Sign out
			</button>
		</div>
	)
}
