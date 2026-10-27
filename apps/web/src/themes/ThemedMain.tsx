import type { ReactNode } from 'react';
import { ThemeBackground } from './backgrounds';
import { ThemeContext, themeVars } from './index';
import type { ThemeDefinition } from './types';
import './themes.css';

/**
 * `<main>` of a themed page (TV, phone): the theme's CSS variables, background and animated
 * layer, and the theme in context (confetti…).
 *
 * - `decorated` false: plain `bg-brand` background, no animated layer (phone answer / result
 *   screens).
 * - `brand` false: keeps the classic `--color-brand` (phones: only the waiting screens follow the
 *   theme).
 */
export function ThemedMain({
  theme,
  className = '',
  decorated = true,
  brand = true,
  light = false,
  children,
}: {
  theme: ThemeDefinition;
  className?: string;
  decorated?: boolean;
  brand?: boolean;
  /** Fewer particles (phones). */
  light?: boolean;
  children: ReactNode;
}) {
  const vars = themeVars(theme);
  if (!brand) delete (vars as Record<string, unknown>)['--color-brand'];
  return (
    <ThemeContext.Provider value={theme}>
      <main
        data-theme={theme.id}
        style={vars}
        className={`relative isolate ${decorated ? 'theme-surface' : 'bg-brand text-white'} ${className}`}
      >
        {decorated && <ThemeBackground theme={theme.id} light={light} />}
        {children}
      </main>
    </ThemeContext.Provider>
  );
}

/** Lobby title of a theme (TV), in its display font; nothing for the classic look. */
export function ThemeLobbyTitle({ theme }: { theme: ThemeDefinition }) {
  const title = theme.lobbyTitle;
  if (!title) return null;
  return (
    <h1
      className={`theme-lobby-title flex items-center gap-5 font-display text-accent ${theme.id === 'retro' ? 'rt-frame text-4xl' : 'text-6xl'}`}
      data-testid="theme-title"
    >
      <span className="theme-bob text-6xl" aria-hidden="true">
        {title.left}
      </span>
      {title.text}
      <span className="theme-bob text-6xl" aria-hidden="true" style={{ animationDelay: '-1s' }}>
        {title.right}
      </span>
    </h1>
  );
}
