/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {
      xs: '475px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Semantic palette — warm, paper-like neutrals with accent colors.
        bg: '#f8f7f4',
        surface: '#ffffff',
        surface2: '#f1f0ec',
        line: 'rgba(0,0,0,0.09)',
        line2: 'rgba(0,0,0,0.16)',
        ink: '#1a1a18',
        ink2: '#6b6a65',
        ink3: '#9e9d98',
        brand: { DEFAULT: '#378ADD', bg: '#E6F1FB', text: '#185FA5' },
        positive: { DEFAULT: '#1D9E75', bg: '#E1F5EE', text: '#0F6E56' },
        negative: { DEFAULT: '#E24B4A', bg: '#FCEBEB', text: '#A32D2D' },
        warn: { DEFAULT: '#BA7517', bg: '#FAEEDA', text: '#633806' },
        violet: { DEFAULT: '#7F77DD', bg: '#EEEDFE', text: '#3C3489' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04)',
        hover: '0 4px 16px rgba(0,0,0,0.08)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};