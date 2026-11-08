import type { QuizTheme } from '@lbq/shared';

/**
 * CSS variables a theme sets on the TV (and on the phones' waiting screens). The answer colors
 * (`--color-answer-*`) are never themed: they must match the phones.
 */
export interface ThemeColors {
  /** `--color-brand`: dark tone of the theme, used by `bg-brand` / `text-brand` (on white). */
  brand: string;
  /** `--theme-bg`: page background (a CSS `background`, gradients allowed). */
  bg: string;
  /** `--theme-panel`: translucent panels on the background (`bg-panel`). */
  panel: string;
  /** `--theme-accent`: decorations, lobby title (`text-accent`). */
  accent: string;
  /** `--theme-text`: main text color (always light: the backgrounds are dark). */
  text: string;
  /** `--theme-timer`: countdown ring. */
  timer: string;
}

/** Podium confetti: colored pieces, plus some emoji pieces (pumpkins, snowflakes…). */
export interface ConfettiStyle {
  colors: string[];
  /** `square` = pixel squares (no rounding). */
  shapes: ('rect' | 'circle' | 'square')[];
  emojis: string[];
  /** Share of the pieces drawn as emojis (0–1). */
  emojiShare: number;
}

/** Host sounds a theme replaces (`public/sounds/<file>.wav`); the others stay the classic ones. */
export type ThemedSound = 'lobby' | 'reveal' | 'podium';

export interface ThemeDefinition {
  id: QuizTheme;
  /** French name (`QUIZ_THEME_NAMES`). */
  name: string;
  /** One emoji for pickers and badges. */
  icon: string;
  colors: ThemeColors;
  /** CSS `font-family` of the display texts (titles, logo) — never the question text. */
  font: string;
  confetti: ConfettiStyle;
  sounds: Partial<Record<ThemedSound, string>>;
  /**
   * Ambiance radio of the TV (« 📻 Radio du thème »): a free SomaFM station (listener-supported,
   * no ads), played in every phase unless the question has a sound to listen to.
   */
  radio: { name: string; url: string };
  /** Lobby title (TV) with its decorations; none for the classic look. */
  lobbyTitle: { text: string; left: string; right: string } | null;
}
