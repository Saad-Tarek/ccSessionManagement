/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          raised: 'hsl(var(--surface-raised))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        // Session status palette — one per badge state
        status: {
          running: 'hsl(var(--status-running))',
          waiting: 'hsl(var(--status-waiting))',
          blocked: 'hsl(var(--status-blocked))',
          error: 'hsl(var(--status-error))',
          done: 'hsl(var(--status-done))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      fontFamily: {
        // Native-first: crisp on every OS with no web-font fetch (the app makes
        // no network egress). Segoe UI Variable is the Windows 11 system face.
        sans: [
          'system-ui',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          '-apple-system',
          'Inter',
          'Roboto',
          'sans-serif'
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace']
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.18s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
