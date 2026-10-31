import { z } from 'zod';

export const GamePhase = z.enum([
  'LOBBY',
  'QUESTION_INTRO',
  'ANSWERING',
  'REVEAL',
  'LEADERBOARD',
  'PODIUM',
  'ENDED',
]);
export type GamePhase = z.infer<typeof GamePhase>;

/** Choice index ↔ shape/color. Fixed for the whole app. */
export const SHAPES = [
  { index: 0, shape: 'triangle', color: 'red', symbol: '▲' },
  { index: 1, shape: 'diamond', color: 'blue', symbol: '◆' },
  { index: 2, shape: 'circle', color: 'yellow', symbol: '●' },
  { index: 3, shape: 'square', color: 'green', symbol: '■' },
] as const;
export type Shape = (typeof SHAPES)[number]['shape'];

export const PIN_LENGTH = 6;
export const NICKNAME_MAX_LENGTH = 20;
export const MAX_PLAYERS_PER_GAME = 30;
export const QUESTION_INTRO_MS = 3000;
/**
 * QUESTION_INTRO of a question that takes jokers, in a game with jokers (or « Survie » haunts):
 * time to read the question and play a joker before the answers appear (T42).
 */
export const JOKER_INTRO_MS = 8000;
/** Long question texts get longer to read: + 1 s per this many characters beyond… */
export const INTRO_CHARS_PER_SECOND = 40;
/** …this length (any game). */
export const INTRO_LONG_TEXT = 80;
/** The intro never lasts longer than this. */
export const MAX_INTRO_MS = 12_000;

/** QUESTION_INTRO duration (PLAN.md §2): 3 s, 8 s with jokers, + reading time for long texts. */
export function introDurationMs(text: string, jokers: boolean): number {
  const extra = Math.max(
    0,
    Math.ceil((text.trim().length - INTRO_LONG_TEXT) / INTRO_CHARS_PER_SECOND),
  );
  return Math.min(MAX_INTRO_MS, (jokers ? JOKER_INTRO_MS : QUESTION_INTRO_MS) + extra * 1000);
}
/** Games are small (~6 players, 15 at most): the leaderboard shows everyone up to this. */
export const LEADERBOARD_SIZE = 15;
export const PODIUM_SIZE = 3;
/**
 * A player who still has to answer (or the host screen) offline this long during a timed phase
 * pauses the game (PLAN.md §2). Shorter drops (Wi-Fi blip) don't freeze the game.
 */
export const PAUSE_GRACE_MS = 2000;
/** 3-2-1 countdown before a paused game resumes (`game:resuming`). */
export const RESUME_COUNTDOWN_MS = 3000;
/**
 * Everyone answered (T43): the reveal waits this long, so the last players can still cancel
 * their answer (« Annuler ma réponse »). The timer running out still reveals at once.
 */
export const ALL_ANSWERED_GRACE_MS = 2000;
/** « Annuler ma réponse »: at most this many cancels per question per player. */
export const MAX_ANSWER_CANCELS = 3;
/** After this long in pause, the host screen highlights « Continuer sans ». */
export const PAUSE_HINT_MS = 60_000;

export const Pin = z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), 'Invalid PIN');
export const Nickname = z.string().trim().min(1).max(NICKNAME_MAX_LENGTH);

// ---------- Game modes ----------

/** `teams`: team mode (below); `survival`: « Survie », hearts and ghosts (`survival.ts`). */
export const GameMode = z.enum(['solo', 'teams', 'survival']);
export type GameMode = z.infer<typeof GameMode>;

/** A team reuses an answer color/shape: team id = shape index (0 = red ▲ … 3 = green ■). */
export const TeamId = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type TeamId = z.infer<typeof TeamId>;

export const TeamCount = z.union([z.literal(2), z.literal(3), z.literal(4)]);
export type TeamCount = z.infer<typeof TeamCount>;
export const DEFAULT_TEAM_COUNT: TeamCount = 2;

export const TEAM_NAMES = ['Équipe Rouge', 'Équipe Bleue', 'Équipe Jaune', 'Équipe Verte'] as const;
