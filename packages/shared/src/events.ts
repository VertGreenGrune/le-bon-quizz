/**
 * Socket.IO protocol — THE contract between apps/web and apps/server.
 * Keep in sync with docs/PLAN.md §4. Any change must be noted in docs/TASKS.md.
 */
import { z } from 'zod';
import { GameMode, GamePhase, Nickname, Pin, TeamCount, TeamId } from './game.js';

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
  /** Team mode: a player has no team, or fewer than 2 teams have players. */
  'TEAMS_NOT_READY',
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

/** Team mode: one team's standing, best first. `score` = sum of per-question averages. */
export interface RankedTeam {
  id: TeamId;
  name: string;
  score: number;
  playerCount: number;
}

export interface StandingsPayload {
  top: RankedPlayer[];
  /** Team mode only: every team still in the game, best first. */
  teams?: RankedTeam[];
}

// ---------- Client → server payloads (validated with zod on the server) ----------

export const HostCreatePayload = z.object({
  quizId: z.string().min(1),
  /** Default `solo`. */
  mode: GameMode.optional(),
  /** Team mode only, default 2. */
  teamCount: TeamCount.optional(),
});
export const HostActionPayload = z.object({ pin: Pin, hostToken: z.string().min(1) });
export const HostKickPayload = HostActionPayload.extend({ playerId: z.string().min(1) });
export const HostMovePlayerPayload = HostKickPayload.extend({ teamId: TeamId });

export const PlayerJoinPayload = z.object({ pin: Pin, nickname: Nickname });
export const PlayerRejoinPayload = z.object({ pin: Pin, sessionToken: z.string().min(1) });
export const PlayerTeamPayload = z.object({ pin: Pin, teamId: TeamId });
export const PlayerAnswerPayload = z.object({
  pin: Pin,
  questionIndex: z.number().int().min(0),
  choiceIndex: z.number().int().min(0).max(3),
});

export type HostCreatePayload = z.infer<typeof HostCreatePayload>;
export type HostActionPayload = z.infer<typeof HostActionPayload>;
export type HostKickPayload = z.infer<typeof HostKickPayload>;
export type HostMovePlayerPayload = z.infer<typeof HostMovePlayerPayload>;
export type PlayerTeamPayload = z.infer<typeof PlayerTeamPayload>;
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
  /** Team mode, LOBBY only: puts a player in another team. */
  'host:moveplayer': (p: HostMovePlayerPayload, ack: (r: Ack) => void) => void;
  /** Team mode, LOBBY only: random balanced teams for every player. */
  'host:shuffle': (p: HostActionPayload, ack: (r: Ack) => void) => void;
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
  /** Team mode, LOBBY only (else `GAME_ALREADY_STARTED`): picks / switches team. */
  'player:team': (p: PlayerTeamPayload, ack: (r: Ack) => void) => void;
  'player:answer': (p: PlayerAnswerPayload, ack: (r: Ack) => void) => void;
}

// ---------- Server → client payloads ----------

export interface GameStatePayload {
  phase: GamePhase;
  mode: GameMode;
  /** -1 in LOBBY. */
  questionIndex: number;
  totalQuestions: number;
  /** Time left in the current timed phase (QUESTION_INTRO / ANSWERING), in ms. Avoids clock skew. */
  remainingMs?: number;
}

export interface LobbyPlayersPayload {
  /** `teamId`: team mode, once the player has a team. */
  players: { id: string; nickname: string; teamId?: TeamId }[];
}

/**
 * Team mode only, to everyone: the teams and their members. In LOBBY every team of the game is
 * listed (empty ones too); from the start on, only the teams in play (those that had players).
 */
export interface LobbyTeamsPayload {
  teams: { id: TeamId; name: string; members: { id: string; nickname: string }[] }[];
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
  /** Team mode: the player's team after this question (score = sum of averages, PLAN.md §3). */
  team?: { id: TeamId; score: number; rank: number };
}

export interface ServerToClientEvents {
  'game:state': (p: GameStatePayload) => void; // all
  'lobby:players': (p: LobbyPlayersPayload) => void; // host
  'lobby:teams': (p: LobbyTeamsPayload) => void; // all (team mode)
  'question:show': (p: QuestionShowPayload) => void; // host
  'question:prompt': (p: QuestionPromptPayload) => void; // players
  'answer:count': (p: AnswerCountPayload) => void; // host
  'question:reveal': (p: QuestionRevealPayload) => void; // host
  'player:result': (p: PlayerResultPayload) => void; // each player
  leaderboard: (p: StandingsPayload) => void; // host
  podium: (p: StandingsPayload) => void; // all
  'player:kicked': (p: Record<string, never>) => void; // that player
  error: (p: ErrorPayload) => void; // sender
}

// ---------- Room names ----------

export const roomAll = (pin: string) => `game:${pin}`;
export const roomHost = (pin: string) => `game:${pin}:host`;
