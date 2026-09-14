'use client'

import { useState } from 'react'
import { signIn, signUp } from '@/lib/auth-client'

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

/** Email + password sign-in / sign-up against apps/auth. */
export function AuthPanel({ onSignedIn }: { onSignedIn: () => void }) {
	const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
	const [email, setEmail] = useState('')
	const [name, setName] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const submit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			if (mode === 'sign-up') await signUp({ email, name, password })
			else await signIn({ email, password })
			onSignedIn()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Something went wrong.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<form onSubmit={submit} style={{ width: '100%', display: 'grid', gap: 14 }}>
			{mode === 'sign-up' && (
				<div>
					<label htmlFor="auth-name" style={labelStyle}>
						Name
					</label>
					<input
						id="auth-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoComplete="name"
						style={inputStyle}
					/>
				</div>
			)}

			<div>
				<label htmlFor="auth-email" style={labelStyle}>
					Email address
				</label>
				<input
					id="auth-email"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					autoComplete="email"
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
					minLength={8}
					autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
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
				{busy ? 'Working…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
			</button>

			<button
				type="button"
				onClick={() => {
					setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
					setError(null)
				}}
				style={{
					background: 'none',
					border: 'none',
					color: 'var(--text-2)',
					fontSize: 13,
					cursor: 'pointer',
					fontFamily: 'inherit',
					padding: 0,
				}}
			>
				{mode === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
			</button>
		</form>
	)
}
