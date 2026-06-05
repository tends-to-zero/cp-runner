/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/webview/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Use VS Code system fonts; no external CDN required
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          '"Cascadia Code"',
          '"Consolas"',
          'monospace',
        ],
      },
      colors: {
        vs: {
          bg: 'var(--vscode-editor-background, #1e1e1e)',
          fg: 'var(--vscode-editor-foreground, #d4d4d4)',
          accent: 'var(--vscode-button-background, #007acc)',
          hover: 'var(--vscode-button-hoverBackground, #0062a3)',
          card: 'rgba(30, 30, 30, 0.65)',
        },
      },
      screens: {
        xs: '400px',
        sm: '550px',
        md: '750px',
      },
    },
  },
  plugins: [],
};
