'use client'

import { useState } from 'react'
import type { OutlineItem } from '@/types'

interface Props {
	items: OutlineItem[]
	currentPage: number
	onNavigate: (page: number) => void
}

export default function PdfOutline({ items, currentPage, onNavigate }: Props) {
	return (
		<aside
			className="shrink-0 overflow-auto flex flex-col"
			style={{
				width: 260,
				background: 'var(--bg)',
				borderRight: '1px solid var(--border)',
			}}
		>
			<div
				className="sticky top-0"
				style={{
					padding: '14px 18px 10px',
					fontSize: 10,
					fontWeight: 700,
					letterSpacing: '0.12em',
					textTransform: 'uppercase' as const,
					color: 'var(--text-3)',
				}}
			>
				Sections
			</div>
			<ul style={{ fontSize: 13, padding: '0 8px 12px' }}>
				{items.map((it, i) => (
					<Node key={i} item={it} depth={0} currentPage={currentPage} onNavigate={onNavigate} />
				))}
			</ul>
		</aside>
	)
}

function Node({
	item,
	depth,
	currentPage,
	onNavigate,
}: {
	item: OutlineItem
	depth: number
	currentPage: number
	onNavigate: (page: number) => void
}) {
	const [open, setOpen] = useState(depth < 1)
	const hasChildren = item.items.length > 0
	const active = item.pageNumber === currentPage

	return (
		<li>
			<div
				className="flex items-center"
				style={{
					paddingLeft: 8 + depth * 14,
					paddingRight: 8,
					paddingTop: 6,
					paddingBottom: 6,
					borderRadius: 999,
					margin: '1px 0',
					background: active ? 'var(--soft)' : 'transparent',
					transition: 'background 0.12s',
				}}
				onMouseEnter={(e) => {
					if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'
				}}
				onMouseLeave={(e) => {
					if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
				}}
			>
				{hasChildren ? (
					<button
						type="button"
						onClick={() => setOpen((o) => !o)}
						style={{
							width: 16,
							height: 20,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							flexShrink: 0,
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							color: 'var(--text-3)',
							padding: 0,
						}}
						aria-label={open ? 'Collapse section' : 'Expand section'}
					>
						<svg
							width="11"
							height="11"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.6"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}
							aria-hidden="true"
						>
							<path d="m9 6 6 6-6 6" />
						</svg>
					</button>
				) : (
					<span style={{ width: 16, flexShrink: 0 }} />
				)}

				<button
					type="button"
					onClick={() => item.pageNumber && onNavigate(item.pageNumber)}
					disabled={!item.pageNumber}
					style={{
						flex: 1,
						textAlign: 'left',
						lineHeight: '20px',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						border: 'none',
						background: 'transparent',
						cursor: item.pageNumber ? 'pointer' : 'default',
						fontFamily: 'inherit',
						color: active ? 'var(--ink)' : 'var(--text-2)',
						fontWeight: active ? 600 : 400,
						opacity: !item.pageNumber ? 0.5 : 1,
						padding: '0 4px',
					}}
					title={item.title}
				>
					{item.title}
				</button>

				{item.pageNumber && (
					<span
						style={{
							fontSize: 11,
							fontWeight: 600,
							color: active ? 'var(--ink)' : 'var(--text-3)',
							flexShrink: 0,
						}}
					>
						{item.pageNumber}
					</span>
				)}
			</div>

			{hasChildren && open && (
				<ul>
					{item.items.map((ch, i) => (
						<Node
							key={i}
							item={ch}
							depth={depth + 1}
							currentPage={currentPage}
							onNavigate={onNavigate}
						/>
					))}
				</ul>
			)}
		</li>
	)
}
