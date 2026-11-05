'use client'

import { useState } from 'react'
import { signIn } from '@/lib/auth-client'

const inputStyle: React.CSSProperties = {
	width: '100%',
	padding: '10px 12px',
	borderRadius: 8,
	border: '1px solid var(--border)',
	background: 'var(--surface)',
	color: 'var(--text-1)',
	fontSize: 14,
	fontFamily: 'inherit',
	outline: 'none',
}

const labelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: 12,
	fontWeight: 600,
	color: 'var(--text-2)',
	marginBottom: 6,
}

/** Username + password sign-in for the single admin user. */
export function AuthPanel({ onSignedIn }: { onSignedIn: () => void }) {
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const submit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			await signIn({ username, password })
			onSignedIn()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Something went wrong.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<form onSubmit={submit} style={{ width: '100%', display: 'grid', gap: 14 }}>
			<div>
				<label htmlFor="auth-username" style={labelStyle}>
					Username
				</label>
				<input
					id="auth-username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					required
					autoComplete="username"
					style={inputStyle}
				/>
			</div>

			<div>
				<label htmlFor="auth-password" style={labelStyle}>
					Password
				</label>
				<input
					id="auth-password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					autoComplete="current-password"
					style={inputStyle}
				/>
			</div>

			{error && (
				<p style={{ margin: 0, fontSize: 13, color: 'var(--danger)', lineHeight: 1.4 }}>{error}</p>
			)}

			<button
				type="submit"
				disabled={busy}
				style={{
					width: '100%',
					padding: '11px 0',
					borderRadius: 10,
					border: 'none',
					background: 'var(--accent)',
					color: '#fff',
					fontWeight: 600,
					fontSize: 15,
					cursor: busy ? 'default' : 'pointer',
					opacity: busy ? 0.7 : 1,
					boxShadow: '0 4px 14px rgba(91,94,255,0.35)',
					fontFamily: 'inherit',
				}}
			>
				{busy ? 'Working…' : 'Sign in'}
			</button>
		</form>
	)
}
