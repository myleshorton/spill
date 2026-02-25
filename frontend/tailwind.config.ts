import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        spill: {
          bg: '#0B0F19',
          surface: '#141926',
          'surface-light': '#1C2436',
          accent: '#00BFA6',
          'accent-hover': '#00D9BC',
          'accent-secondary': '#FFB74D',
          'text-primary': '#E8ECF4',
          'text-secondary': '#6B7994',
          success: '#00E676',
          error: '#FF5252',
          divider: '#1E2842',
        },
      },
      fontFamily: {
        headline: ['Sora', 'sans-serif'],
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
          '0%, 100%': { boxShadow: '0 0 8px rgba(0, 191, 166, 0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(0, 191, 166, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
