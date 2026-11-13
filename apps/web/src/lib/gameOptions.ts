import {
  DEFAULT_TEAM_COUNT,
  QuizTheme,
  SURVIVAL_DEFAULT_HEARTS,
  SurvivalHearts,
  TeamCount,
  type GameMode,
} from '@lbq/shared';

/** How a new game is played: chosen in the start dialog, carried by the `/host/new` URL. */
export interface GameOptions {
  mode: GameMode;
  /** Team mode only. */
  teamCount?: TeamCount;
  /** « Survie » only: hearts per player (1–5). */
  hearts?: number;
  /** Jokers (power-ups); absent = classic game. */
  jokers?: true;
  /** TV theme for this game (T40); absent = the quiz's own theme. */
  theme?: QuizTheme;
  /** « 🧪 Tester » from the editor (T66): a test game, never saved. */
  test?: true;
  /** Test of one question: its index in the quiz (0-based; `question=<n>` 1-based in the URL). */
  question?: number;
}

export const SOLO: GameOptions = { mode: 'solo' };

/**
 * "Start game" target (contract with the host page, see TASKS.md T15 / T25 / T31 / T40):
 * `/host/new?quizId=<id>&mode=teams&teams=<n>&jokers=1&theme=<theme>` or
 * `mode=survival&hearts=<n>`; no `quizId` = demo quiz, no `mode` = solo, no `jokers` = classic
 * game, no `theme` = the quiz's theme.
 */
export function hostUrl(quizId: string | undefined, options: GameOptions = SOLO): string {
  const params = new URLSearchParams();
  if (quizId) params.set('quizId', quizId);
  if (options.mode === 'teams') {
    params.set('mode', 'teams');
    params.set('teams', String(options.teamCount ?? DEFAULT_TEAM_COUNT));
  } else if (options.mode === 'survival') {
    params.set('mode', 'survival');
    params.set('hearts', String(options.hearts ?? SURVIVAL_DEFAULT_HEARTS));
  }
  if (options.jokers) params.set('jokers', '1');
  if (options.theme) params.set('theme', options.theme);
  if (options.test) params.set('test', '1');
  if (options.question !== undefined) params.set('question', String(options.question + 1));
  const query = params.toString();
  return query ? `/host/new?${query}` : '/host/new';
}

/**
 * Reads `mode` / `teams` / `hearts` / `theme` back from the host page URL; anything unexpected
 * → solo / 2 teams / 3 hearts / the quiz's theme.
 */
export function parseGameOptions(params: URLSearchParams): GameOptions {
  const theme = QuizTheme.safeParse(params.get('theme'));
  const question = Number(params.get('question'));
  const extra = {
    ...(params.get('jokers') === '1' && { jokers: true as const }),
    ...(theme.success && { theme: theme.data }),
    ...(params.get('test') === '1' && { test: true as const }),
    ...(Number.isInteger(question) && question >= 1 && { question: question - 1 }),
  };
  const mode = params.get('mode');
  if (mode === 'survival') {
    const hearts = SurvivalHearts.safeParse(Number(params.get('hearts')));
    return {
      mode: 'survival',
      hearts: hearts.success ? hearts.data : SURVIVAL_DEFAULT_HEARTS,
      ...extra,
    };
  }
  if (mode !== 'teams') return { ...SOLO, ...extra };
  const count = TeamCount.safeParse(Number(params.get('teams')));
  return { mode: 'teams', teamCount: count.success ? count.data : DEFAULT_TEAM_COUNT, ...extra };
}
