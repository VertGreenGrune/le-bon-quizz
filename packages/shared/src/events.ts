/**
 * Socket.IO protocol — THE contract between apps/web and apps/server.
 * Keep in sync with docs/PLAN.md §4. Any change must be noted in docs/TASKS.md.
 */
import { z } from 'zod';
import { GamePhase, Nickname, Pin } from './game.js';

// ---------- Common ----------

export const ErrorCode = z.enum([
  'GAME_NOT_FOUND',
  'GAME_ALREADY_STARTED',
  'GAME_FULL',
  'NICKNAME_TAKEN',
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'QUIZ_NOT_FOUND',
  'NOT_ANSWERING',
  'ALREADY_ANSWERED',
  'SESSION_NOT_FOUND',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

/** Every ack callback receives either `{ ok: true, ...data }` or `{ ok: false, error }`. */
export type Ack<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: ErrorPayload };

export interface RankedPlayer {
  nickname: string;
  score: number;
}

// ---------- Client → server payloads (validated with zod on the server) ----------

export const HostCreatePayload = z.object({ quizId: z.string().min(1) });
export const HostActionPayload = z.object({ pin: Pin, hostToken: z.string().min(1) });
export const HostKickPayload = HostActionPayload.extend({ playerId: z.string().min(1) });

export const PlayerJoinPayload = z.object({ pin: Pin, nickname: Nickname });
export const PlayerRejoinPayload = z.object({ pin: Pin, sessionToken: z.string().min(1) });
export const PlayerAnswerPayload = z.object({
  pin: Pin,
  questionIndex: z.number().int().min(0),
  choiceIndex: z.number().int().min(0).max(3),
});

export type HostCreatePayload = z.infer<typeof HostCreatePayload>;
export type HostActionPayload = z.infer<typeof HostActionPayload>;
export type HostKickPayload = z.infer<typeof HostKickPayload>;
export type PlayerJoinPayload = z.infer<typeof PlayerJoinPayload>;
export type PlayerRejoinPayload = z.infer<typeof PlayerRejoinPayload>;
export type PlayerAnswerPayload = z.infer<typeof PlayerAnswerPayload>;

export interface ClientToServerEvents {
  'host:create': (
    p: HostCreatePayload,
    ack: (r: Ack<{ pin: string; hostToken: string }>) => void,
  ) => void;
  'host:start': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  'host:next': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  'host:kick': (p: HostKickPayload, ack: (r: Ack) => void) => void;
  'host:end': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  /**
   * Host screen reloaded / reconnected: re-attaches this socket as host, then the server
   * re-sends everything the host screen needs for the current phase.
   */
  'host:rejoin': (p: HostActionPayload, ack: (r: Ack) => void) => void;

  'player:join': (
    p: PlayerJoinPayload,
    ack: (r: Ack<{ playerId: string; sessionToken: string }>) => void,
  ) => void;
  'player:rejoin': (
    p: PlayerRejoinPayload,
    ack: (r: Ack<{ playerId: string; nickname: string; totalScore: number }>) => void,
  ) => void;
  'player:answer': (p: PlayerAnswerPayload, ack: (r: Ack) => void) => void;
}

// ---------- Server → client payloads ----------

export interface GameStatePayload {
  phase: GamePhase;
  /** -1 in LOBBY. */
  questionIndex: number;
  totalQuestions: number;
  /** Time left in the current timed phase (QUESTION_INTRO / ANSWERING), in ms. Avoids clock skew. */
  remainingMs?: number;
}

export interface LobbyPlayersPayload {
  players: { id: string; nickname: string }[];
}

/** To the host only: full question. */
export interface QuestionShowPayload {
  index: number;
  text: string;
  imageUrl?: string;
  choices: string[];
  timeLimitSec: number;
}

/** To players only: never contains the question text or the correct answer. */
export interface QuestionPromptPayload {
  index: number;
  choiceCount: number;
  timeLimitSec: number;
}

export interface AnswerCountPayload {
  answered: number;
  total: number;
}

export interface QuestionRevealPayload {
  correctIndexes: number[];
  /** Number of players who picked each choice index. */
  distribution: number[];
}

export interface PlayerResultPayload {
  correct: boolean;
  /** Includes `streakBonus`. */
  pointsEarned: number;
  /** Consecutive correct answers including this one; 0 if wrong / no answer. */
  streak: number;
  /** Streak bonus already included in `pointsEarned` (PLAN.md §3). */
  streakBonus: number;
  totalScore: number;
  rank: number;
}

export interface ServerToClientEvents {
  'game:state': (p: GameStatePayload) => void; // all
  'lobby:players': (p: LobbyPlayersPayload) => void; // host
  'question:show': (p: QuestionShowPayload) => void; // host
  'question:prompt': (p: QuestionPromptPayload) => void; // players
  'answer:count': (p: AnswerCountPayload) => void; // host
  'question:reveal': (p: QuestionRevealPayload) => void; // host
  'player:result': (p: PlayerResultPayload) => void; // each player
  leaderboard: (p: { top: RankedPlayer[] }) => void; // host
  podium: (p: { top: RankedPlayer[] }) => void; // all
  'player:kicked': (p: Record<string, never>) => void; // that player
  error: (p: ErrorPayload) => void; // sender
}

// ---------- Room names ----------

export const roomAll = (pin: string) => `game:${pin}`;
export const roomHost = (pin: string) => `game:${pin}:host`;
