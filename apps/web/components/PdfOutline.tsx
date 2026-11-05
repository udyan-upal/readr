'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OutlineItem } from '@/types'

interface Props {
	items: OutlineItem[]
	currentPage: number
	onNavigate: (page: number) => void
	onCollapse?: () => void
}

interface FlatEntry {
	key: string
	page: number | undefined
}

function flatten(items: OutlineItem[], prefix = ''): FlatEntry[] {
	const out: FlatEntry[] = []
	items.forEach((item, i) => {
		const key = prefix ? `${prefix}.${i}` : String(i)
		out.push({ key, page: item.pageNumber })
		if (item.items.length) out.push(...flatten(item.items, key))
	})
	return out
}

export default function PdfOutline({ items, currentPage, onNavigate, onCollapse }: Props) {
	const flat = useMemo(() => flatten(items), [items])
	const [activeKey, setActiveKey] = useState<string | null>(null)

	// Several sections can share a page (e.g. Conclusion and Impact Statement).
	// Highlight only one: keep the section the reader picked, otherwise fall back
	// to the first section on this page, then the last one before it.
	useEffect(() => {
		if (!flat.length) {
			setActiveKey(null)
			return
		}
		const current = flat.find((entry) => entry.key === activeKey)
		if (current?.page === currentPage) return

		const samePage = flat.find((entry) => entry.page === currentPage)
		if (samePage) {
			if (samePage.key !== activeKey) setActiveKey(samePage.key)
			return
		}

		let previous: FlatEntry | undefined
		for (const entry of flat) {
			if (entry.page != null && entry.page <= currentPage) previous = entry
		}
		const next = previous?.key ?? null
		if (next !== activeKey) setActiveKey(next)
	}, [activeKey, currentPage, flat])

	const select = (key: string, page: number | undefined) => {
		setActiveKey(key)
		if (page) onNavigate(page)
	}

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
					padding: '10px 10px 8px 18px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 8,
				}}
			>
				<span
					style={{
						fontSize: 10,
						fontWeight: 700,
						letterSpacing: '0.12em',
						textTransform: 'uppercase',
						color: 'var(--text-3)',
					}}
				>
					Sections
				</span>
				{onCollapse && (
					<button
						type="button"
						onClick={onCollapse}
						aria-label="Hide sections"
						title="Hide sections"
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 28,
							height: 28,
							padding: 0,
							border: '1px solid var(--border)',
							borderRadius: 999,
							background: 'transparent',
							color: 'var(--text-3)',
							cursor: 'pointer',
							transition: 'background 0.14s, color 0.14s, border-color 0.14s',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = 'var(--soft)'
							e.currentTarget.style.color = 'var(--ink)'
							e.currentTarget.style.borderColor = 'var(--accent)'
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = 'transparent'
							e.currentTarget.style.color = 'var(--text-3)'
							e.currentTarget.style.borderColor = 'var(--border)'
						}}
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
					</button>
				)}
			</div>
			<ul style={{ fontSize: 13, padding: '0 8px 12px' }}>
				{items.map((it, i) => (
					<Node
						key={i}
						item={it}
						path={String(i)}
						depth={0}
						activeKey={activeKey}
						onSelect={select}
					/>
				))}
			</ul>
		</aside>
	)
}

function Node({
	item,
	path,
	depth,
	activeKey,
	onSelect,
}: {
	item: OutlineItem
	path: string
	depth: number
	activeKey: string | null
	onSelect: (key: string, page: number | undefined) => void
}) {
	const [open, setOpen] = useState(depth < 1)
	const hasChildren = item.items.length > 0
	const active = activeKey === path

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
					onClick={() => onSelect(path, item.pageNumber)}
					disabled={!item.pageNumber}
					aria-current={active ? 'location' : undefined}
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
							path={`${path}.${i}`}
							depth={depth + 1}
							activeKey={activeKey}
							onSelect={onSelect}
						/>
					))}
				</ul>
			)}
		</li>
	)
}
