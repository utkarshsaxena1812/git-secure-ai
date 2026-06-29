/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#04060a',
        accent: { DEFAULT: '#ff7a18', hover: '#e96a0c' },
        azure: { DEFAULT: '#2f80ff', glow: '#3aa0ff' },
        danger: '#f85149',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'sans-serif'],
        playfair: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: { container: '1160px' },
    },
  },
  plugins: [],
}
