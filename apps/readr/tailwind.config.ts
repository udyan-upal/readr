import type { Config } from 'tailwindcss'

export default {
	content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				ink: { 1: '#1C1917', 2: '#57534E', 3: '#A8A29E' },
				cream: { DEFAULT: '#F7F6F2', 50: '#FDFCFA', 200: '#EDE8DF', 300: '#E8E3DA' },
				accent: { DEFAULT: '#5B5EFF', dark: '#4244CC', subtle: '#EEEFFF' },
			},
			fontFamily: {
				sans: ['Georgia', '"Times New Roman"', 'Times', 'serif'],
			},
			boxShadow: {
				card: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
				panel: '0 4px 24px rgba(0,0,0,0.08), 0 1px 6px rgba(0,0,0,0.04)',
				elevated: '0 16px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
			},
		},
	},
	plugins: [],
} satisfies Config
