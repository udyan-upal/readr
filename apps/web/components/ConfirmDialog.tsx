'use client'

import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
	open: boolean
	title: string
	body: React.ReactNode
	confirmLabel?: string
	cancelLabel?: string
	busy?: boolean
	onConfirm: () => void
	onCancel: () => void
}

/** Themed confirmation dialog. Escape, backdrop click, and Cancel all dismiss. */
export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel = 'Confirm',
	cancelLabel = 'Cancel',
	busy = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const cancelRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !busy) onCancel()
		}
		document.addEventListener('keydown', onKey)
		const prevOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		cancelRef.current?.focus()
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = prevOverflow
		}
	}, [open, busy, onCancel])

	if (!open) return null

	return (
		<div
			role="presentation"
			onClick={() => {
				if (!busy) onCancel()
			}}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 1000,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: 20,
				background: 'rgba(24, 18, 12, 0.45)',
				backdropFilter: 'blur(2px)',
				animation: 'confirm-fade 0.14s ease-out',
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="confirm-dialog-title"
				aria-describedby="confirm-dialog-body"
				onClick={(e) => e.stopPropagation()}
				style={{
					width: '100%',
					maxWidth: 400,
					background: 'var(--surface)',
					border: '1px solid var(--border)',
					borderRadius: 14,
					boxShadow: 'var(--shadow-lg)',
					padding: 22,
					animation: 'confirm-rise 0.16s ease-out',
				}}
			>
				<div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
					<div
						style={{
							width: 38,
							height: 38,
							flexShrink: 0,
							borderRadius: 10,
							background: 'rgba(220, 38, 38, 0.12)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'var(--danger)',
						}}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.9"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
						</svg>
					</div>
					<div style={{ minWidth: 0 }}>
						<h2
							id="confirm-dialog-title"
							style={{
								margin: 0,
								fontSize: 18,
								fontWeight: 700,
								color: 'var(--text-1)',
								lineHeight: 1.3,
							}}
						>
							{title}
						</h2>
						<div
							id="confirm-dialog-body"
							style={{
								marginTop: 6,
								fontSize: 13.5,
								color: 'var(--text-2)',
								lineHeight: 1.55,
								overflowWrap: 'anywhere',
							}}
						>
							{body}
						</div>
					</div>
				</div>

				<div
					style={{
						marginTop: 22,
						display: 'flex',
						justifyContent: 'flex-end',
						gap: 10,
					}}
				>
					<button
						ref={cancelRef}
						type="button"
						onClick={onCancel}
						disabled={busy}
						style={{
							padding: '8px 16px',
							borderRadius: 9,
							border: '1px solid var(--border)',
							background: 'var(--surface-2)',
							color: 'var(--text-2)',
							fontSize: 13,
							fontWeight: 600,
							fontFamily: 'inherit',
							cursor: busy ? 'default' : 'pointer',
							opacity: busy ? 0.6 : 1,
							transition: 'border-color 0.15s, color 0.15s',
						}}
						onMouseEnter={(e) => {
							if (busy) return
							e.currentTarget.style.borderColor = 'var(--text-3)'
							e.currentTarget.style.color = 'var(--text-1)'
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.borderColor = 'var(--border)'
							e.currentTarget.style.color = 'var(--text-2)'
						}}
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={busy}
						style={{
							padding: '8px 16px',
							borderRadius: 9,
							border: 'none',
							background: 'var(--danger)',
							color: '#fff',
							fontSize: 13,
							fontWeight: 600,
							fontFamily: 'inherit',
							cursor: busy ? 'default' : 'pointer',
							opacity: busy ? 0.65 : 1,
							transition: 'filter 0.15s',
						}}
						onMouseEnter={(e) => {
							if (busy) return
							e.currentTarget.style.filter = 'brightness(0.92)'
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.filter = 'none'
						}}
					>
						{busy ? 'Deleting…' : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}
