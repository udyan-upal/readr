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
	const [showPassword, setShowPassword] = useState(false)

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
				<div style={{ position: 'relative' }}>
					<input
						id="auth-password"
						type={showPassword ? 'text' : 'password'}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="current-password"
						style={{ ...inputStyle, paddingRight: 40 }}
					/>
					<button
						type="button"
						onClick={() => setShowPassword((v) => !v)}
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						title={showPassword ? 'Hide password' : 'Show password'}
						style={{
							position: 'absolute',
							top: 0,
							right: 0,
							height: '100%',
							width: 38,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'transparent',
							border: 'none',
							padding: 0,
							cursor: 'pointer',
							color: 'var(--text-2)',
							borderRadius: 8,
						}}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							{showPassword ? (
								<>
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
									<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
									<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
									<line x1="1" y1="1" x2="23" y2="23" />
								</>
							) : (
								<>
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
									<circle cx="12" cy="12" r="3" />
								</>
							)}
						</svg>
					</button>
				</div>
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
