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
export const MAX_PLAYERS_PER_GAME = 200;
export const QUESTION_INTRO_MS = 3000;
export const LEADERBOARD_SIZE = 5;
export const PODIUM_SIZE = 3;

export const Pin = z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), 'Invalid PIN');
export const Nickname = z.string().trim().min(1).max(NICKNAME_MAX_LENGTH);
