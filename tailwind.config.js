/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
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
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        accent: {
          DEFAULT: 'var(--accent-color)',
          hover: 'var(--accent-hover)'
        },
        border: {
          DEFAULT: 'var(--border-color)',
          hover: 'var(--border-hover)'
        },
        success: 'var(--success-color)',
        error: 'var(--error-color)',
        warning: 'var(--warning-color)'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', '"Segoe UI Mono"', '"JetBrains Mono"', 'Menlo', 'monospace']
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px'
      },
      spacing: {
        'sidebar': '260px',
        'header': '52px'
      }
    }
  },
  plugins: []
};

