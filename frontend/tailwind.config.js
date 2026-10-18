/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dalBlue: {
          DEFAULT: '#0F2D4A',
          50: '#F0F5FA',
          100: '#E1ECF4',
          500: '#1E4E7A',
          600: '#163E63',
          700: '#113251',
          800: '#0F2D4A',
          900: '#0A1E32',
        },
        chinarRed: {
          DEFAULT: '#C2410C',
          50: '#FFF7ED',
          100: '#FFEDD5',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
        },
        techCoral: {
          DEFAULT: '#FF6B4A',
          light: '#FFA085',
          dark: '#E85534',
          50: '#FFF5F2',
          100: '#FFE9E3',
          200: '#FFD4C7',
          500: '#FF6B4A',
          600: '#E85534',
          700: '#C73E20',
        },
        saffronGold: {
          DEFAULT: '#D97706',
          50: '#FFFBEB',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        paper: '#F8F9FA',
        charcoal: '#0F172A',
        successGreen: '#059669',
        warningGold: '#D97706',
        border: '#E2E8F0',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
        sm: '0 2px 4px -1px rgba(15, 23, 42, 0.09), 0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.05)',
        md: '0 4px 12px -2px rgba(15, 23, 42, 0.12), 0 2px 4px -1px rgba(15, 23, 42, 0.07), 0 0 0 1px rgba(15, 23, 42, 0.06)',
        lg: '0 10px 25px -3px rgba(15, 23, 42, 0.14), 0 4px 6px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
        subtle: '0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.06)',
        card: '0 2px 8px -1px rgba(15, 23, 42, 0.09), 0 1px 3px 0 rgba(15, 23, 42, 0.07), 0 0 0 1px rgba(15, 23, 42, 0.06)',
        cardHover: '0 12px 28px -4px rgba(15, 23, 42, 0.16), 0 4px 10px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.10)',
        darkEdge: '0 2px 10px -1px rgba(15, 23, 42, 0.10), 0 0 0 1px rgba(51, 65, 85, 0.16)',
      }
    },
  },
  plugins: [],
}