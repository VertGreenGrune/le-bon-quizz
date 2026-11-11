/**
 * « Patate chaude » (T63, hot potato round): one question = one round. A bomb goes from player to
 * player; whoever holds it answers quick sub-questions on their phone — right = the bomb goes to
 * someone else, wrong = another sub-question after a short lock. When the secret fuse runs out,
 * the holder loses the round.
 */

/** Sub-questions of a round: at least / at most this many. */
export const POTATO_MIN_QUESTIONS = 3;
export const POTATO_MAX_QUESTIONS = 30;
/** A sub-question: its text and each choice at most this long, 2–4 choices. */
export const POTATO_TEXT_MAX_LENGTH = 120;
export const POTATO_CHOICE_MAX_LENGTH = 75;
export const POTATO_MIN_CHOICES = 2;
export const POTATO_MAX_CHOICES = 4;
/** The fuse (drawn by the server in [min, max] when the round starts, never sent). */
export const POTATO_MIN_FUSE_SEC = 10;
export const POTATO_MAX_FUSE_SEC = 300;
export const POTATO_DEFAULT_FUSE_MIN_SEC = 30;
export const POTATO_DEFAULT_FUSE_MAX_SEC = 60;
/** A wrong answer: the holder waits this long before the next sub-question can be answered. */
export const POTATO_WRONG_LOCK_MS = 2000;
/** Each right answer (pass) earns `basePoints × POTATO_PASS_SHARE`. */
export const POTATO_PASS_SHARE = 0.1;
/** Everyone but the holder when it goes off earns `basePoints × POTATO_SURVIVOR_SHARE`. */
export const POTATO_SURVIVOR_SHARE = 0.5;

/** What one pass (right answer) earns. */
export function potatoPassPoints(basePoints: number): number {
  return Math.round(basePoints * POTATO_PASS_SHARE);
}

/** What surviving the round earns (on top of the passes). */
export function potatoSurvivorPoints(basePoints: number): number {
  return Math.round(basePoints * POTATO_SURVIVOR_SHARE);
}

/** A sub-question as stored in the quiz (`correct` = index of the right choice). */
export interface PotatoSubQuestion {
  text: string;
  choices: string[];
  correct: number;
}

/**
 * A sub-question as shown to the holder and on the TV: never which choice is right. `number` =
 * 1 for the first one asked in the round, 2 for the next…
 */
export interface PotatoSub {
  number: number;
  text: string;
  choices: string[];
}
