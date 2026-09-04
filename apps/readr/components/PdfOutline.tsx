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
				width: 248,
				background: 'var(--surface)',
				borderRight: '1px solid var(--border)',
			}}
		>
			<div
				className="sticky top-0"
				style={{
					padding: '13px 14px 11px',
					borderBottom: '1px solid var(--border-subtle)',
					background: 'var(--surface)',
					fontSize: 10,
					fontWeight: 700,
					letterSpacing: '0.08em',
					textTransform: 'uppercase' as const,
					color: 'var(--text-3)',
				}}
			>
				Contents
			</div>
			<ul className="py-2" style={{ fontSize: 13 }}>
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
					paddingLeft: 10 + depth * 14,
					paddingRight: 10,
					paddingTop: 3,
					paddingBottom: 3,
					borderRadius: 7,
					margin: '1px 6px',
					background: active ? 'var(--accent-s)' : 'transparent',
					transition: 'background 0.1s',
				}}
				onMouseEnter={(e) => {
					if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)'
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
							fontSize: 10,
						}}
					>
						{open ? '▾' : '▸'}
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
						color: active ? 'var(--accent)' : 'var(--text-2)',
						fontWeight: active ? 600 : 400,
						opacity: !item.pageNumber ? 0.5 : 1,
						padding: '0 4px',
					}}
					title={item.title}
				>
					{item.title}
				</button>

				{item.pageNumber && (
					<span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
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
