import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc5fa',
          400: '#38a6f6',
          500: '#0ea5e9',
          600: '#0078d4', // Primary interactive action blue
          700: '#005a9e',
          800: '#004f84', // Primary steel navbar navy
          900: '#003559',
          950: '#002038',
        },
        stage: {
          rm: '#475569',
          rolling: '#0284c7',
          cutting: '#0891b2',
          pickling: '#0d9488',
          drawing: '#7c3aed',
          ht: '#d97706',
          straightening: '#b45309',
          finishing: '#059669',
          qc: '#2563eb',
          dispatch: '#16a34a',
        },
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      },
      borderRadius: {
        'panel': '0.625rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
