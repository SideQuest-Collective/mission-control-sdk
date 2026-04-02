import type { VisualTheme } from '../types.js';
import { themeKeyToCssVar } from './tokens.js';

/**
 * Applies a VisualTheme to the document root by setting CSS custom properties.
 */
export function applyTheme(theme: VisualTheme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = themeKeyToCssVar[key as keyof VisualTheme];
    if (cssVar) {
      root.style.setProperty(cssVar, value);
    }
  }
}

/**
 * Returns the system's preferred color scheme.
 */
export function getSystemColorScheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
