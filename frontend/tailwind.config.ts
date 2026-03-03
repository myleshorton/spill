import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        spill: {
          bg: '#111111',
          surface: '#1A1A1A',
          'surface-light': '#242424',
          accent: '#B71C1C',
          'accent-hover': '#D32F2F',
          'accent-secondary': '#FFFFFF',
          'text-primary': '#D4D4D4',
          'text-secondary': '#6B7994',
          success: '#00E676',
          error: '#FF5252',
          divider: '#2E2E2E',
        },
      },
      fontFamily: {
        headline: ['Inter Tight', 'sans-serif'],
        serif: ['DM Serif Text', 'Georgia', 'serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 6px rgba(183, 28, 28, 0.2)' },
          '50%': { boxShadow: '0 0 14px rgba(183, 28, 28, 0.35)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
