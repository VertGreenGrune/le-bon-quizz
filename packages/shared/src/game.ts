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
/** Games are small (~6 players, 15 at most): the leaderboard shows everyone up to this. */
export const LEADERBOARD_SIZE = 15;
export const PODIUM_SIZE = 3;

export const Pin = z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), 'Invalid PIN');
export const Nickname = z.string().trim().min(1).max(NICKNAME_MAX_LENGTH);

// ---------- Team mode ----------

export const GameMode = z.enum(['solo', 'teams']);
export type GameMode = z.infer<typeof GameMode>;

/** A team reuses an answer color/shape: team id = shape index (0 = red ▲ … 3 = green ■). */
export const TeamId = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type TeamId = z.infer<typeof TeamId>;

export const TeamCount = z.union([z.literal(2), z.literal(3), z.literal(4)]);
export type TeamCount = z.infer<typeof TeamCount>;
export const DEFAULT_TEAM_COUNT: TeamCount = 2;

export const TEAM_NAMES = ['Équipe Rouge', 'Équipe Bleue', 'Équipe Jaune', 'Équipe Verte'] as const;
