import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // All semantic colors are driven by CSS variables so they
        // respond instantly when the <html> class switches dark ↔ light.
        void:    'rgb(var(--color-void)    / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        raised:  'rgb(var(--color-raised)  / <alpha-value>)',
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink)        / <alpha-value>)',
          muted:   'rgb(var(--color-ink-muted)   / <alpha-value>)',
          subtle:  'rgb(var(--color-ink-subtle)  / <alpha-value>)',
        },
        border: {
          subtle:  'rgb(var(--color-border-subtle) / <alpha-value>)',
          DEFAULT: 'rgb(var(--color-border)        / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--color-gold)       / <alpha-value>)',
          light:   'rgb(var(--color-gold-light)  / <alpha-value>)',
          dim:     'rgb(var(--color-gold-dim)    / <alpha-value>)',
        },
        sage: {
          DEFAULT: 'rgb(var(--color-sage)       / <alpha-value>)',
          light:   'rgb(var(--color-sage-light)  / <alpha-value>)',
        },
        rust: {
          DEFAULT: 'rgb(var(--color-rust)       / <alpha-value>)',
          light:   'rgb(var(--color-rust-light)  / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.2rem' }],
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'shimmer': 'shimmer 2s infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'card-highlight': 'cardHighlight 1.8s ease-out forwards',
        'marquee': 'marquee 25s linear infinite',
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
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(200,162,104,0)' },
          '50%': { boxShadow: '0 0 18px 3px rgba(200,162,104,0.22)' },
        },
        cardHighlight: {
          '0%':       { boxShadow: '0 0 0 0 rgba(200,162,104,0)' },
          '15%':      { boxShadow: '0 0 0 2px rgba(200,162,104,0.55), 0 0 14px 3px rgba(200,162,104,0.18)' },
          '75%':      { boxShadow: '0 0 0 2px rgba(200,162,104,0.55), 0 0 14px 3px rgba(200,162,104,0.18)' },
          '100%':     { boxShadow: '0 0 0 0 rgba(200,162,104,0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
