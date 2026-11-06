'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export type GradientTheme =
  | 'lunaria'
  | 'aurora'
  | 'sunset'
  | 'sapphire'
  | 'neon'
  | 'monochrome';

export interface GradientPreset {
  id: GradientTheme;
  name: string;
  tagline: string;
  colors: [string, string, string];
  previewGradient: string;
  glowColor: string;
}

export const GRADIENT_THEMES: GradientPreset[] = [
  {
    id: 'lunaria',
    name: 'Lunaria Orchid',
    tagline: 'Signature royal orchid, lilac & violet glow',
    colors: ['#cb6de6', '#a855f7', '#6366f1'],
    previewGradient: 'linear-gradient(135deg, #cb6de6 0%, #a855f7 50%, #6366f1 100%)',
    glowColor: 'rgba(203, 109, 230, 0.35)',
  },
  {
    id: 'aurora',
    name: 'Emerald Aurora',
    tagline: 'Vibrant emerald, mint, & oceanic teal',
    colors: ['#10b981', '#14b8a6', '#06b6d4'],
    previewGradient: 'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%)',
    glowColor: 'rgba(16, 185, 129, 0.35)',
  },
  {
    id: 'sunset',
    name: 'Solar Flare',
    tagline: 'Warm amber, sunset orange, & coral rose',
    colors: ['#f59e0b', '#f97316', '#f43f5e'],
    previewGradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #f43f5e 100%)',
    glowColor: 'rgba(249, 115, 22, 0.35)',
  },
  {
    id: 'sapphire',
    name: 'Oceanic Sapphire',
    tagline: 'Electric sky blue, royal sapphire, & indigo',
    colors: ['#0ea5e9', '#3b82f6', '#6366f1'],
    previewGradient: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%)',
    glowColor: 'rgba(59, 130, 246, 0.35)',
  },
  {
    id: 'neon',
    name: 'Neon Cyberpunk',
    tagline: 'High-voltage fuchsia, hot pink, & ultraviolet',
    colors: ['#ec4899', '#d946ef', '#8b5cf6'],
    previewGradient: 'linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #8b5cf6 100%)',
    glowColor: 'rgba(236, 72, 153, 0.35)',
  },
  {
    id: 'monochrome',
    name: 'Minimalist Platinum',
    tagline: 'Refined titanium, slate silver, & cool chrome',
    colors: ['#94a3b8', '#64748b', '#475569'],
    previewGradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #475569 100%)',
    glowColor: 'rgba(148, 163, 184, 0.3)',
  },
];

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  gradientTheme: GradientTheme;
  setGradientTheme: (theme: GradientTheme) => void;
  gradientPresets: GradientPreset[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'lunaria_theme';
const GRADIENT_STORAGE_KEY = 'lunaria_gradient_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  const [gradientTheme, setGradientThemeState] = useState<GradientTheme>('lunaria');

  // Helper to determine resolved theme from system preference
  const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const applyTheme = useCallback((newTheme: Theme) => {
    if (typeof document === 'undefined') return;

    const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
    setResolvedTheme(resolved);

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  }, []);

  const applyGradientTheme = useCallback((newGradient: GradientTheme) => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.gradient = newGradient;
  }, []);

  // Initialize theme and gradient theme on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initialTheme: Theme =
      saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
    setThemeState(initialTheme);
    applyTheme(initialTheme);

    const savedGradient = localStorage.getItem(GRADIENT_STORAGE_KEY) as GradientTheme | null;
    const isValidGradient = GRADIENT_THEMES.some((g) => g.id === savedGradient);
    const initialGradient: GradientTheme =
      isValidGradient && savedGradient ? savedGradient : 'lunaria';
    setGradientThemeState(initialGradient);
    applyGradientTheme(initialGradient);
  }, [applyTheme, applyGradientTheme]);

  // Listen to system preference changes when in 'system' mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  };

  const setGradientTheme = (newGradient: GradientTheme) => {
    setGradientThemeState(newGradient);
    try {
      localStorage.setItem(GRADIENT_STORAGE_KEY, newGradient);
    } catch {}
    applyGradientTheme(newGradient);
  };

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        gradientTheme,
        setGradientTheme,
        gradientPresets: GRADIENT_THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
