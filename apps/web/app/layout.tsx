import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
	title: 'readr — PDF read aloud',
	description: 'Upload a PDF and hear it read aloud with word-synced Edge neural voices',
	applicationName: 'readr',
	manifest: '/site.webmanifest',
	icons: {
		icon: [
			{ url: '/favicon.ico', sizes: '48x48' },
			{ url: '/favicon.svg', type: 'image/svg+xml' },
		],
		apple: '/apple-touch-icon.png',
	},
	openGraph: {
		title: 'readr — PDF read aloud',
		description: 'Upload a PDF and hear it read aloud with word-synced Edge neural voices',
		type: 'website',
	},
}

export const viewport: Viewport = {
	themeColor: '#c67139',
}

/** Applies the saved theme before first paint so there is no flash. */
const themeInit = `
try {
	const saved = localStorage.getItem('readr.theme');
	const theme = saved === 'light' || saved === 'sepia' || saved === 'dark' ? saved : 'light';
	document.documentElement.dataset.theme = theme;
} catch {
	document.documentElement.dataset.theme = 'light';
}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" data-theme="light" suppressHydrationWarning>
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;500;600;700&display=swap"
					rel="stylesheet"
				/>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap */}
				<script dangerouslySetInnerHTML={{ __html: themeInit }} />
			</head>
			<body className="min-h-screen">{children}</body>
		</html>
	)
}
