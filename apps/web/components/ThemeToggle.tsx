'use client'

import { useEffect, useRef, useState } from 'react'

type Theme = 'light' | 'sepia' | 'dark'

const THEMES: { value: Theme; label: string; swatch: string; ring: string }[] = [
	{ value: 'light', label: 'Light', swatch: '#f5ead8', ring: 'rgba(32,30,29,0.2)' },
	{ value: 'sepia', label: 'Sepia', swatch: '#efe0c4', ring: 'rgba(46,43,37,0.24)' },
	{ value: 'dark', label: 'Dark', swatch: '#201e1d', ring: 'rgba(249,244,237,0.28)' },
]

function readTheme(): Theme {
	if (typeof document === 'undefined') return 'light'
	const t = document.documentElement.dataset.theme
	return t === 'sepia' || t === 'dark' ? t : 'light'
}

/** Light / sepia / dark switcher, persisted in localStorage like the extension. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
	const [theme, setTheme] = useState<Theme>('light')
	const [open, setOpen] = useState(false)
	const wrapRef = useRef<HTMLDivElement>(null)

	useEffect(() => setTheme(readTheme()), [])

	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const apply = (next: Theme) => {
		document.documentElement.dataset.theme = next
		try {
			localStorage.setItem('readr.theme', next)
		} catch {
			// storage blocked — theme still applies for this page
		}
		setTheme(next)
		setOpen(false)
	}

	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button
				type="button"
				className={`btn-pill${compact ? ' icon-only' : ''}`}
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="true"
				aria-expanded={open}
				aria-label="Choose theme"
				title="Theme"
			>
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M12 3a9 9 0 1 0 9 9c-4.5 0-9-4.5-9-9Z" />
					<path d="M12 3v18" opacity="0.35" />
				</svg>
				{!compact && <span>Theme</span>}
			</button>

			{open && (
				<div
					role="menu"
					aria-label="Theme"
					style={{
						position: 'absolute',
						top: 'calc(100% + 8px)',
						right: 0,
						zIndex: 200,
						minWidth: 148,
						padding: 6,
						borderRadius: 14,
						border: '1px solid var(--border)',
						background: 'var(--surface)',
						boxShadow: 'var(--shadow-lg)',
					}}
				>
					{THEMES.map((t) => {
						const active = theme === t.value
						return (
							<button
								key={t.value}
								type="button"
								role="menuitemradio"
								aria-checked={active}
								onClick={() => apply(t.value)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 9,
									width: '100%',
									padding: '7px 9px',
									border: 0,
									borderRadius: 9,
									background: active ? 'var(--soft)' : 'transparent',
									color: active ? 'var(--ink)' : 'var(--text-2)',
									fontFamily: 'inherit',
									fontSize: 13,
									fontWeight: active ? 600 : 500,
									textAlign: 'left',
									cursor: 'pointer',
								}}
								onMouseEnter={(e) => {
									if (!active) e.currentTarget.style.background = 'var(--surface-2)'
								}}
								onMouseLeave={(e) => {
									if (!active) e.currentTarget.style.background = 'transparent'
								}}
							>
								<span
									aria-hidden="true"
									style={{
										width: 16,
										height: 16,
										borderRadius: '50%',
										background: t.swatch,
										boxShadow: `inset 0 0 0 1px ${t.ring}`,
										flexShrink: 0,
									}}
								/>
								{t.label}
								{active && (
									<svg
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.6"
										strokeLinecap="round"
										strokeLinejoin="round"
										style={{ marginLeft: 'auto' }}
										aria-hidden="true"
									>
										<path d="m5 12 4.5 4.5L19 7" />
									</svg>
								)}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}
