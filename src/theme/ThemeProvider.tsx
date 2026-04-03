'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { TeamBlock, VisualTheme } from '../types.js';
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
  manifestPath?: string;
  children: ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  darkTheme,
  lightTheme,
  defaultMode = 'system',
  manifestPath = '/api/manifest',
  children,
}: ThemeProviderProps) {
  const [manifestDarkTheme, setManifestDarkTheme] = useState<VisualTheme | null>(null);
  const [manifestLightTheme, setManifestLightTheme] = useState<VisualTheme | null>(null);
  const resolvedDefault = defaultMode === 'system' ? getSystemColorScheme() : defaultMode;
  const [mode, setMode] = useState<'dark' | 'light'>(resolvedDefault);

  useEffect(() => {
    let cancelled = false;

    async function loadManifestTheme() {
      try {
        const response = await fetch(manifestPath, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { team?: Pick<TeamBlock, 'visual_theme' | 'visual_theme_light'> };
        if (cancelled || !data.team) {
          return;
        }

        setManifestDarkTheme(data.team.visual_theme ?? null);
        setManifestLightTheme(data.team.visual_theme_light ?? null);
      } catch {
        // Fall back to the supplied or SDK default themes when no manifest route is available.
      }
    }

    void loadManifestTheme();

    return () => {
      cancelled = true;
    };
  }, [manifestPath]);

  const dark = darkTheme ?? manifestDarkTheme ?? DEFAULT_DARK_THEME;
  const light = lightTheme ?? manifestLightTheme ?? DEFAULT_LIGHT_THEME;
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
