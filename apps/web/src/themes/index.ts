import { createContext, useContext, type CSSProperties } from 'react';
import { DEFAULT_QUIZ_THEME, QuizTheme } from '@lbq/shared';
import { christmas } from './christmas';
import { classic } from './classic';
import { halloween } from './halloween';
import { retro } from './retro';
import { space } from './space';
import type { ThemeDefinition } from './types';

export type { ConfettiStyle, ThemeDefinition, ThemedSound } from './types';

/** Every TV theme (T40), in the order of the pickers. */
export const THEMES: Record<QuizTheme, ThemeDefinition> = {
  classic,
  halloween,
  christmas,
  retro,
  space,
};

/** Unknown / missing theme (older server, bad URL) → classic. */
export function getTheme(id: string | null | undefined): ThemeDefinition {
  const parsed = QuizTheme.safeParse(id);
  return THEMES[parsed.success ? parsed.data : DEFAULT_QUIZ_THEME];
}

/** The CSS variables of a theme, to put on the element that wraps the themed page. */
export function themeVars(theme: ThemeDefinition): CSSProperties {
  const c = theme.colors;
  return {
    '--color-brand': c.brand,
    '--theme-bg': c.bg,
    '--theme-panel': c.panel,
    '--theme-accent': c.accent,
    '--theme-text': c.text,
    '--theme-timer': c.timer,
    '--theme-font': theme.font,
  } as CSSProperties;
}

export const ThemeContext = createContext<ThemeDefinition>(classic);

/** Theme of the page (confetti, decorations); classic outside a `ThemeContext`. */
export function useTheme(): ThemeDefinition {
  return useContext(ThemeContext);
}
