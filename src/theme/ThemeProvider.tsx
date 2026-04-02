import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { VisualTheme } from '../types.js';
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from './tokens.js';
import { applyTheme, getSystemColorScheme } from './utils.js';

export interface ThemeContextValue {
  theme: VisualTheme;
  mode: 'dark' | 'light';
  toggle: () => void;
}

export interface ThemeProviderProps {
  darkTheme?: VisualTheme;
  lightTheme?: VisualTheme;
  defaultMode?: 'dark' | 'light' | 'system';
  children: ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  darkTheme,
  lightTheme,
  defaultMode = 'system',
  children,
}: ThemeProviderProps) {
  const resolvedDefault = defaultMode === 'system' ? getSystemColorScheme() : defaultMode;
  const [mode, setMode] = useState<'dark' | 'light'>(resolvedDefault);

  const dark = darkTheme ?? DEFAULT_DARK_THEME;
  const light = lightTheme ?? DEFAULT_LIGHT_THEME;
  const activeTheme = mode === 'dark' ? dark : light;

  useEffect(() => {
    applyTheme(activeTheme);
    document.documentElement.setAttribute('data-theme', mode);
  }, [activeTheme, mode]);

  const toggle = useCallback(() => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: activeTheme, mode, toggle }),
    [activeTheme, mode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
