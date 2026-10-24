import {
  DEFAULT_TEAM_COUNT,
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
}

export const SOLO: GameOptions = { mode: 'solo' };

/**
 * "Start game" target (contract with the host page, see TASKS.md T15 / T25 / T31):
 * `/host/new?quizId=<id>&mode=teams&teams=<n>&jokers=1` or `mode=survival&hearts=<n>`; no
 * `quizId` = demo quiz, no `mode` = solo, no `jokers` = classic game.
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
  const query = params.toString();
  return query ? `/host/new?${query}` : '/host/new';
}

/**
 * Reads `mode` / `teams` / `hearts` back from the host page URL; anything unexpected → solo /
 * 2 teams / 3 hearts.
 */
export function parseGameOptions(params: URLSearchParams): GameOptions {
  const jokers = params.get('jokers') === '1' ? { jokers: true as const } : {};
  const mode = params.get('mode');
  if (mode === 'survival') {
    const hearts = SurvivalHearts.safeParse(Number(params.get('hearts')));
    return {
      mode: 'survival',
      hearts: hearts.success ? hearts.data : SURVIVAL_DEFAULT_HEARTS,
      ...jokers,
    };
  }
  if (mode !== 'teams') return { ...SOLO, ...jokers };
  const count = TeamCount.safeParse(Number(params.get('teams')));
  return { mode: 'teams', teamCount: count.success ? count.data : DEFAULT_TEAM_COUNT, ...jokers };
}
