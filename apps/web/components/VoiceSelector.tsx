'use client'

import { useMemo } from 'react'
import type { Voice } from '@/types'

interface Props {
	voices: Voice[]
	value: string
	onChange: (shortName: string) => void
}

export default function VoiceSelector({ voices, value, onChange }: Props) {
	const grouped = useMemo(() => {
		const byLocale = new Map<string, Voice[]>()
		for (const v of voices) {
			const arr = byLocale.get(v.locale) ?? []
			arr.push(v)
			byLocale.set(v.locale, arr)
		}
		return Array.from(byLocale.entries()).sort(([a], [b]) => a.localeCompare(b))
	}, [voices])

	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			style={{
				padding: '4px 8px',
				borderRadius: 7,
				border: '1.5px solid var(--border)',
				background: 'var(--surface)',
				color: 'var(--text-1)',
				fontSize: 13,
				fontFamily: 'inherit',
				cursor: 'pointer',
				maxWidth: 220,
			}}
		>
			{grouped.map(([locale, list]) => (
				<optgroup key={locale} label={locale}>
					{list.map((v) => (
						<option key={v.shortName} value={v.shortName}>
							{v.friendlyName}
						</option>
					))}
				</optgroup>
			))}
		</select>
	)
}
