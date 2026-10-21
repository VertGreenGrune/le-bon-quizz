import { DEFAULT_TEAM_COUNT, TeamCount, type GameMode } from '@lbq/shared';

/** How a new game is played: chosen in the start dialog, carried by the `/host/new` URL. */
export interface GameOptions {
  mode: GameMode;
  /** Team mode only. */
  teamCount?: TeamCount;
}

export const SOLO: GameOptions = { mode: 'solo' };

/**
 * "Start game" target (contract with the host page, see TASKS.md T15):
 * `/host/new?quizId=<id>&mode=teams&teams=<n>`; no `quizId` = demo quiz, no `mode` = solo.
 */
export function hostUrl(quizId: string | undefined, options: GameOptions = SOLO): string {
  const params = new URLSearchParams();
  if (quizId) params.set('quizId', quizId);
  if (options.mode === 'teams') {
    params.set('mode', 'teams');
    params.set('teams', String(options.teamCount ?? DEFAULT_TEAM_COUNT));
  }
  const query = params.toString();
  return query ? `/host/new?${query}` : '/host/new';
}

/** Reads `mode` / `teams` back from the host page URL; anything unexpected → solo / 2 teams. */
export function parseGameOptions(params: URLSearchParams): GameOptions {
  if (params.get('mode') !== 'teams') return SOLO;
  const count = TeamCount.safeParse(Number(params.get('teams')));
  return { mode: 'teams', teamCount: count.success ? count.data : DEFAULT_TEAM_COUNT };
}
