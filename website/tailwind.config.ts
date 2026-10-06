import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    screens: {
      sm: '640px',
      md: '900px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        background: '#08090d',
        surface: '#10121a',
        'surface-elevated': '#161a26',
        'surface-border': '#202434',
        // Map indigo utility classes to the Lunaria lilac-orchid-violet palette
        indigo: {
          50: '#faf5ff',
          100: '#f5e8ff',
          200: '#edd5fe',
          300: '#dfb4fd',
          400: '#cb82f6',
          500: '#cb6de6', // Core Lunaria logo orchid
          600: '#a855f7', // Primary active/button violet
          700: '#9333ea', // Deep droplet violet
          800: '#7e22ce',
          900: '#581c87',
          950: '#2e1065',
        },
        primary: {
          50: '#faf5ff',
          100: '#f5e8ff',
          200: '#edd5fe',
          300: '#dfb4fd',
          400: '#cb82f6',
          500: '#cb6de6',
          600: '#a855f7',
          700: '#9333ea',
          800: '#7e22ce',
          900: '#581c87',
        },
        lunaria: {
          light: '#f3dbf9',
          petal: '#e5b4f2',
          orchid: '#cb6de6',
          droplet: '#b85be8',
          violet: '#9d3dd4',
          deep: '#2e1065',
        },
        emerald: {
          400: '#34d399',
          500: '#10b981',
        },
        accent: '#c084fc',
      },
      backgroundImage: {
        'gradient-lunaria': 'linear-gradient(135deg, #e5b4f2 0%, #cb6de6 50%, #9d3dd4 100%)',
        'gradient-lunaria-subtle': 'linear-gradient(135deg, rgba(229,180,242,0.12) 0%, rgba(203,109,230,0.18) 50%, rgba(157,61,212,0.08) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;

