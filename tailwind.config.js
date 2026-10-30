/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Use CSS custom properties for theme-aware colors
        'bg-app': 'var(--bg-app)',
        'bg-sidebar': 'var(--bg-sidebar)',
        'bg-panel': 'var(--bg-panel)',
        'bg-card': 'var(--bg-card)',
        'bg-input': 'var(--bg-input)',
        'bg-control-hover': 'var(--bg-control-hover)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        accent: {
          DEFAULT: 'var(--accent-color)',
          hover: 'var(--accent-hover)',
          fill: 'var(--accent-fill)',
          'fill-hover': 'var(--accent-fill-hover)',
          text: 'var(--accent-text)',
          on: 'var(--on-accent)',
        },
        border: {
          DEFAULT: 'var(--border-color)',
          hover: 'var(--border-hover)',
          field: 'var(--field-border)',
        },
        success: {
          DEFAULT: 'var(--success-color)',
          text: 'var(--success-text)',
        },
        error: {
          DEFAULT: 'var(--error-color)',
          text: 'var(--error-text)',
        },
        warning: 'var(--warning-color)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          '"Cascadia Mono"',
          '"SF Mono"',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
      },
      spacing: {
        sidebar: '232px',
        header: '36px',
      },
    },
  },
  plugins: [],
};
