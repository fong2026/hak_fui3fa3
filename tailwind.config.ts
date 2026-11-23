import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        indigoHakka: '#1E3A5F',
        tung: '#F8FAFC',
        persimmon: '#D97706',
      },
      fontFamily: {
        sans: ['var(--font-noto-sans)', 'Noto Sans TC', 'sans-serif'],
        serif: ['var(--font-noto-serif)', 'Noto Serif TC', 'serif'],
      },
      boxShadow: {
        card: '0 14px 40px rgba(30, 58, 95, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
