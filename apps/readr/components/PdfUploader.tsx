'use client'

import { useCallback, useRef, useState } from 'react'

interface Props {
	onFile: (file: File) => void
}

const MAX_SIZE = 20 * 1024 * 1024

export default function PdfUploader({ onFile }: Props) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const validate = useCallback((file: File): string | null => {
		if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
			return 'Only PDF files are supported'
		if (file.size > MAX_SIZE) return 'File exceeds 20 MB limit'
		return null
	}, [])

	const handle = useCallback(
		(file: File) => {
			const err = validate(file)
			if (err) {
				setError(err)
				return
			}
			setError(null)
			onFile(file)
		},
		[onFile, validate],
	)

	return (
		<div className="w-full max-w-lg mx-auto">
			<div
				onDragOver={(e) => {
					e.preventDefault()
					setDragging(true)
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault()
					setDragging(false)
					const f = e.dataTransfer.files[0]
					if (f) handle(f)
				}}
				onClick={() => inputRef.current?.click()}
				className="group cursor-pointer"
				style={{
					borderRadius: 16,
					border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
					background: dragging ? 'var(--accent-s)' : 'var(--surface)',
					padding: '48px 32px',
					textAlign: 'center',
					transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
					boxShadow: dragging ? '0 0 0 4px var(--accent-s)' : 'var(--shadow-sm)',
				}}
				onMouseEnter={(e) => {
					if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'
				}}
				onMouseLeave={(e) => {
					if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
				}}
			>
				{/* Icon */}
				<div
					className="mx-auto mb-4 flex items-center justify-center"
					style={{
						width: 56,
						height: 56,
						borderRadius: 14,
						background: dragging ? 'var(--accent)' : 'var(--accent-s)',
						transition: 'background 0.2s',
					}}
				>
					<svg width="26" height="26" fill="none" viewBox="0 0 24 24">
						<path
							d="M12 16V8m0 0-3 3m3-3 3 3"
							stroke={dragging ? '#fff' : 'var(--accent)'}
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<rect
							x="3"
							y="3"
							width="18"
							height="18"
							rx="4"
							stroke={dragging ? '#fff' : 'var(--accent)'}
							strokeWidth="1.5"
							strokeDasharray="3 2"
						/>
					</svg>
				</div>

				<p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 6 }}>
					{dragging ? 'Release to open' : 'Drop a PDF here, or click to browse'}
				</p>
				<p style={{ fontSize: 13, color: 'var(--text-3)' }}>PDF only · max 20 MB</p>

				<input
					ref={inputRef}
					type="file"
					accept="application/pdf,.pdf"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0]
						if (f) handle(f)
						e.target.value = ''
					}}
				/>
			</div>

			{error && (
				<p className="mt-3 text-center text-sm" style={{ color: 'var(--danger)' }}>
					{error}
				</p>
			)}
		</div>
	)
}
