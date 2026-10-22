import { DEFAULT_TEAM_COUNT, TeamCount, type GameMode } from '@lbq/shared';

/** How a new game is played: chosen in the start dialog, carried by the `/host/new` URL. */
export interface GameOptions {
  mode: GameMode;
  /** Team mode only. */
  teamCount?: TeamCount;
  /** Jokers (power-ups); absent = classic game. */
  jokers?: true;
}

export const SOLO: GameOptions = { mode: 'solo' };

/**
 * "Start game" target (contract with the host page, see TASKS.md T15 / T25):
 * `/host/new?quizId=<id>&mode=teams&teams=<n>&jokers=1`; no `quizId` = demo quiz, no `mode` =
 * solo, no `jokers` = classic game.
 */
export function hostUrl(quizId: string | undefined, options: GameOptions = SOLO): string {
  const params = new URLSearchParams();
  if (quizId) params.set('quizId', quizId);
  if (options.mode === 'teams') {
    params.set('mode', 'teams');
    params.set('teams', String(options.teamCount ?? DEFAULT_TEAM_COUNT));
  }
  if (options.jokers) params.set('jokers', '1');
  const query = params.toString();
  return query ? `/host/new?${query}` : '/host/new';
}

/** Reads `mode` / `teams` back from the host page URL; anything unexpected → solo / 2 teams. */
export function parseGameOptions(params: URLSearchParams): GameOptions {
  const jokers = params.get('jokers') === '1' ? { jokers: true as const } : {};
  if (params.get('mode') !== 'teams') return { ...SOLO, ...jokers };
  const count = TeamCount.safeParse(Number(params.get('teams')));
  return { mode: 'teams', teamCount: count.success ? count.data : DEFAULT_TEAM_COUNT, ...jokers };
}
