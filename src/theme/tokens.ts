import type { VisualTheme } from '../types.js';

/** CSS custom property names that the theme engine manages */
export const THEME_TOKENS = [
  '--mc-primary',
  '--mc-accent',
  '--mc-surface',
  '--mc-surface-raised',
  '--mc-surface-elevated',
  '--mc-border',
  '--mc-text-primary',
  '--mc-text-secondary',
  '--mc-text-tertiary',
  '--mc-status-success',
  '--mc-status-warning',
  '--mc-status-error',
  '--mc-glow-primary',
] as const;

/**
 * Maps VisualTheme keys to CSS custom property names.
 * The ThemeProvider applies this mapping when setting properties on :root.
 */
export const themeKeyToCssVar: Record<keyof VisualTheme, string> = {
  primary: '--mc-primary',
  accent: '--mc-accent',
  background: '--mc-surface',
  surface: '--mc-surface-raised',
  text_primary: '--mc-text-primary',
  text_secondary: '--mc-text-secondary',
  status_working: '--mc-status-success',
  status_idle: '--mc-status-warning',
  status_offline: '--mc-status-error',
  glow: '--mc-glow-primary',
};

/** Default dark theme — based on mission-control/frontend/src/styles/tokens.css :root */
export const DEFAULT_DARK_THEME: VisualTheme = {
  primary: '#3b82f6',
  accent: '#6366f1',
  background: '#06080e',
  surface: '#0c1019',
  text_primary: '#f0f2f7',
  text_secondary: '#8b93a8',
  status_working: '#22c55e',
  status_idle: '#eab308',
  status_offline: '#ef4444',
  glow: 'rgba(59, 130, 246, 0.15)',
};

/** Default light theme — based on mission-control/frontend/src/styles/tokens.css [data-theme="light"] */
export const DEFAULT_LIGHT_THEME: VisualTheme = {
  primary: '#2563eb',
  accent: '#4f46e5',
  background: '#f8f9fb',
  surface: '#ffffff',
  text_primary: '#0f1729',
  text_secondary: '#5b6478',
  status_working: '#16a34a',
  status_idle: '#ca8a04',
  status_offline: '#dc2626',
  glow: 'rgba(37, 99, 235, 0.06)',
};
