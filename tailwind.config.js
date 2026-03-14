/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        nyra: {
          bg:      '#0d0b09',
          surface: '#141210',
          border:  'rgba(232,224,214,0.07)',
        },
        // ── Warm Terracotta palette ────────────────────────────────────
        terra: {
          50:  '#FDF5F0',
          100: '#F9E5D9',
          200: '#F0C9B3',
          300: '#E5A88A',
          400: '#D4785C',   // primary accent
          500: '#C46A4E',
          600: '#A8563D',   // hover / pressed
          700: '#8A4432',
          800: '#6D3527',
          900: '#4A2319',
        },
        gold: {
          50:  '#FBF7F0',
          100: '#F3EBD9',
          200: '#E5D4B3',
          300: '#D4BA8A',
          400: '#C9A87C',   // secondary accent (champagne)
          500: '#B8965E',
          600: '#9A7D4D',
          700: '#8B7355',
          800: '#6B5A42',
          900: '#4A3E2D',
        },
        sage: {
          400: '#7DB886',   // success green (warm-shifted)
          500: '#6BA774',
          600: '#5A9462',
        },
        blush: {
          400: '#CF6D6D',   // danger / error (dusty rose)
          500: '#BF5E5E',
          600: '#A84D4D',
        },
        warm: {
          50:  '#E8E0D6',   // primary text (warm off-white)
          100: '#D6CEC4',   // secondary text
          200: '#B8B0A4',   // muted text
          // Background scale (warm charcoal)
          800: '#1E1B17',
          850: '#1A1714',
          900: '#141210',
          950: '#0D0B09',
        },
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-soft': 'pulse 3s ease-in-out infinite',
      }
    }
  },
  plugins: []
}
