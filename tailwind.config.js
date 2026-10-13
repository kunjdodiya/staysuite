/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        'surface-3': v('surface-3'),
        border: v('border'),
        'border-strong': v('border-strong'),
        fg: v('fg'),
        muted: v('muted'),
        subtle: v('subtle'),
        accent: v('accent'),
        'accent-fg': v('accent-fg'),
        'accent-soft': v('accent-soft'),
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
        info: v('info'),
        s1: v('s1'), s2: v('s2'), s3: v('s3'), s4: v('s4'), s5: v('s5'), s6: v('s6'), s7: v('s7'), s8: v('s8'),
      },
      borderRadius: { xl: '14px', '2xl': '18px', '3xl': '24px' },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 20 / 0.04), 0 1px 1px rgb(16 24 20 / 0.03)',
        pop: '0 12px 32px -8px rgb(16 24 20 / 0.18), 0 2px 6px rgb(16 24 20 / 0.06)',
        ring: '0 0 0 4px rgb(var(--accent) / 0.15)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'rise-in': { from: { opacity: 0, transform: 'translateY(6px) scale(.985)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-in-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'rise-in': 'rise-in .22s cubic-bezier(.2,.8,.2,1)',
        'slide-in-right': 'slide-in-right .28s cubic-bezier(.2,.8,.2,1)',
        'slide-in-up': 'slide-in-up .28s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
