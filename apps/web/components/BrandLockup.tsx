'use client'

import Image from 'next/image'

type Variant = 'horizontal' | 'stacked'

const DIMENSIONS = {
	horizontal: { width: 732, height: 256 },
	stacked: { width: 536, height: 414 },
} as const

/**
 * Approved Cutout, Bold lockup. Two files swap on theme: the light asset uses
 * the dark wordmark, the reversed asset the paper wordmark.
 */
export function BrandLockup({
	variant = 'horizontal',
	height = 24,
}: {
	variant?: Variant
	height?: number
}) {
	const base = variant === 'stacked' ? 'readr-stacked' : 'readr-horizontal'
	const { width, height: naturalHeight } = DIMENSIONS[variant]
	return (
		<span className="brand-lockup" style={{ height }} aria-label="readr">
			<Image
				className="brand-on-light"
				src={`/brand/${base}.svg`}
				alt="readr"
				width={width}
				height={naturalHeight}
				unoptimized
			/>
			<Image
				className="brand-on-dark"
				src={`/brand/${base}-reversed.svg`}
				alt=""
				aria-hidden="true"
				width={width}
				height={naturalHeight}
				unoptimized
			/>
		</span>
	)
}
