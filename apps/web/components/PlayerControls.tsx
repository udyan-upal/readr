'use client'

import { useEffect, useRef, useState } from 'react'

const READER_VOICES = [
	{ label: 'Ava', value: 'en-US-AvaNeural' },
	{ label: 'Chris', value: 'en-US-ChristopherNeural' },
	{ label: 'Emma', value: 'en-US-EmmaNeural' },
]

const RATES = [
	{ label: '0.5×', value: '-50%' },
	{ label: '1×', value: '+0%' },
	{ label: '1.5×', value: '+50%' },
	{ label: '2×', value: '+100%' },
]

interface Props {
	voice: string
	onVoiceChange: (v: string) => void
	rate: string
	onRateChange: (r: string) => void
	isPlaying: boolean
	isLoading: boolean
	onPlay: () => void
	onPause: () => void
	onStop: () => void
	progress: number
	error: string | null
	onRetry: () => void
}

/** Floating read-aloud pill, same shape and behaviour as the extension reader. */
export default function PlayerControls({
	voice,
	onVoiceChange,
	rate,
	onRateChange,
	isPlaying,
	isLoading,
	onPlay,
	onPause,
	onStop,
	progress,
	error,
	onRetry,
}: Props) {
	const [voiceOpen, setVoiceOpen] = useState(false)
	const voiceRef = useRef<HTMLDivElement>(null)

	const selectedVoice = READER_VOICES.find((v) => v.value === voice)?.label ?? 'Voice'
	const selectedRate = RATES.find((r) => r.value === rate)?.label ?? '1×'
	const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100)

	useEffect(() => {
		if (!voiceOpen) return
		const onDown = (e: MouseEvent) => {
			if (!voiceRef.current?.contains(e.target as Node)) setVoiceOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setVoiceOpen(false)
		}
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [voiceOpen])

	const cycleRate = () => {
		const i = RATES.findIndex((r) => r.value === rate)
		onRateChange(RATES[(i + 1) % RATES.length].value)
	}

	return (
		<div className="read-player-wrap">
			{error && (
				<div className="read-player-error" role="status">
					<span>{error}</span>
					<button type="button" onClick={onRetry}>
						Retry
					</button>
				</div>
			)}

			<div className="read-player" role="group" aria-label="Read aloud controls">
				<button
					type="button"
					className="read-play"
					onClick={isPlaying ? onPause : onPlay}
					disabled={isLoading}
					title={isPlaying ? 'Pause' : 'Play'}
					aria-label={isPlaying ? 'Pause' : 'Play'}
				>
					{isLoading ? (
						<span className="read-spinner" aria-hidden="true" />
					) : isPlaying ? (
						<svg width="13" height="14" viewBox="0 0 13 14" fill="currentColor" aria-hidden="true">
							<rect x="0" y="0" width="4.5" height="14" rx="1.6" />
							<rect x="8.5" y="0" width="4.5" height="14" rx="1.6" />
						</svg>
					) : (
						<svg
							className="read-icon-play"
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M8 5.5v13l11-6.5-11-6.5Z" />
						</svg>
					)}
				</button>

				<div className="read-meter">
					<div className="read-track" aria-hidden="true">
						<div className="read-track-fill" style={{ width: `${percent}%` }} />
					</div>
					<div className="read-status-row">
						<span className="read-status">{isPlaying ? 'Reading…' : `${percent}%`}</span>
						<span className="read-dot" aria-hidden="true">
							·
						</span>
						<div className="read-voice" ref={voiceRef}>
							<button
								type="button"
								className="read-voice-toggle"
								onClick={() => setVoiceOpen((o) => !o)}
								aria-haspopup="true"
								aria-expanded={voiceOpen}
								title="Choose a voice"
							>
								{selectedVoice}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="m7 10 5 5 5-5" />
								</svg>
							</button>
							{voiceOpen && (
								<div className="read-voice-popover" role="group" aria-label="Choose a voice">
									<div className="read-voice-heading">Voice</div>
									{READER_VOICES.map((v) => {
										const active = v.value === voice
										return (
											<button
												key={v.value}
												type="button"
												className={`read-chip${active ? ' is-active' : ''}`}
												onClick={() => {
													onVoiceChange(v.value)
													setVoiceOpen(false)
												}}
												aria-pressed={active}
											>
												<span className="read-chip-letter">{v.label[0]}</span>
												{v.label}
											</button>
										)
									})}
								</div>
							)}
						</div>
					</div>
				</div>

				<span className="read-divider" aria-hidden="true" />

				<button
					type="button"
					className="read-rate"
					onClick={cycleRate}
					title="Playback speed"
					aria-label={`Playback speed ${selectedRate}`}
				>
					{selectedRate}
				</button>

				<button type="button" className="read-stop" onClick={onStop} title="Stop" aria-label="Stop">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
	)
}
