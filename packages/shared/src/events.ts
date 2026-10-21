/**
 * Socket.IO protocol — THE contract between apps/web and apps/server.
 * Keep in sync with docs/PLAN.md §4. Any change must be noted in docs/TASKS.md.
 */
import { z } from 'zod';
import { AvatarId } from './avatars.js';
import { GameMode, GamePhase, Nickname, Pin, TeamCount, TeamId } from './game.js';
import { TYPE_ANSWER_MAX_LENGTH, type QuestionType, type SliderSettings } from './quiz.js';

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
  /** Answer sent while the game is paused (a player or the host screen lost the connection). */
  'GAME_PAUSED',
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
  avatar: AvatarId;
  score: number;
}

/** A player as listed in the lobby / team columns. */
export interface LobbyMember {
  id: string;
  nickname: string;
  avatar: AvatarId;
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

/** `avatar` missing (older clients) → the server picks a random one. */
export const PlayerJoinPayload = z.object({
  pin: Pin,
  nickname: Nickname,
  avatar: AvatarId.optional(),
});
/** Join screen hint: the avatars already taken in this game (before joining). */
export const PlayerAvatarsPayload = z.object({ pin: Pin });
export const PlayerRejoinPayload = z.object({ pin: Pin, sessionToken: z.string().min(1) });
export const PlayerTeamPayload = z.object({ pin: Pin, teamId: TeamId });
const answerTarget = { pin: Pin, questionIndex: z.number().int().min(0) };
/**
 * Exactly one of `choiceIndex` (MCQ, TRUE_FALSE, POLL), `text` (TYPE_ANSWER) or `value`
 * (SLIDER). The server answers `INVALID_PAYLOAD` if the kind doesn't match the question.
 */
export const PlayerAnswerPayload = z.union([
  z.strictObject({ ...answerTarget, choiceIndex: z.number().int().min(0).max(3) }),
  z.strictObject({
    ...answerTarget,
    text: z.string().trim().min(1).max(TYPE_ANSWER_MAX_LENGTH),
  }),
  z.strictObject({ ...answerTarget, value: z.number() }),
]);

export type HostCreatePayload = z.infer<typeof HostCreatePayload>;
export type HostActionPayload = z.infer<typeof HostActionPayload>;
export type HostKickPayload = z.infer<typeof HostKickPayload>;
export type HostMovePlayerPayload = z.infer<typeof HostMovePlayerPayload>;
export type PlayerTeamPayload = z.infer<typeof PlayerTeamPayload>;
export type PlayerJoinPayload = z.infer<typeof PlayerJoinPayload>;
export type PlayerRejoinPayload = z.infer<typeof PlayerRejoinPayload>;
export type PlayerAvatarsPayload = z.infer<typeof PlayerAvatarsPayload>;
export type PlayerAnswerPayload = z.infer<typeof PlayerAnswerPayload>;
/** The answer itself, without `pin` / `questionIndex`. */
export type AnswerInput = { choiceIndex: number } | { text: string } | { value: number };

export interface PlayerJoinAck {
  playerId: string;
  sessionToken: string;
  avatar: AvatarId;
  /** Took the place of a disconnected player (started game): the fields below are theirs. */
  reclaimed?: true;
  nickname?: string;
  totalScore?: number;
}

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
  /**
   * « Continuer sans… »: while paused, the missing players become absent for the current
   * question and the game resumes (after the usual 3-2-1 countdown). No-op when not paused.
   */
  'host:resume': (p: HostActionPayload, ack: (r: Ack) => void) => void;

  /**
   * In LOBBY: joins. In a started game: takes the place of the disconnected player with that
   * nickname (`reclaimed: true`, their score / team / avatar / streak; the old session token is
   * revoked), `NICKNAME_TAKEN` if that player is connected, `GAME_ALREADY_STARTED` otherwise.
   */
  'player:join': (p: PlayerJoinPayload, ack: (r: Ack<PlayerJoinAck>) => void) => void;
  'player:rejoin': (
    p: PlayerRejoinPayload,
    ack: (
      r: Ack<{ playerId: string; nickname: string; avatar: AvatarId; totalScore: number }>,
    ) => void,
  ) => void;
  /**
   * Join screen, before joining: the avatars already taken in that game (shown dimmed, still
   * selectable). `GAME_NOT_FOUND` for an unknown PIN.
   */
  'player:avatars': (
    p: PlayerAvatarsPayload,
    ack: (r: Ack<{ taken: AvatarId[]; started: boolean }>) => void,
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
  /**
   * Time left in the current timed phase (QUESTION_INTRO / ANSWERING), in ms. Avoids clock skew.
   * While paused: the frozen value.
   */
  remainingMs?: number;
  /** QUESTION_INTRO / ANSWERING only: the game is paused, the timer frozen (PLAN.md §2). */
  paused?: GamePause;
}

export interface GamePause {
  /** Players who still have to answer and are offline (empty while resuming). */
  waitingFor: LobbyMember[];
  /** The host screen lost its connection. */
  hostMissing: boolean;
  /** How long the game has been paused, in ms. */
  sinceMs: number;
}

/** Everyone is back (or the host continued without them): resumes in `inMs` (3-2-1). */
export interface GameResumingPayload {
  inMs: number;
}

export interface LobbyPlayersPayload {
  /**
   * `teamId`: team mode, once the player has a team. `offline`: the player's phone lost the
   * connection (re-sent when it drops / comes back).
   */
  players: (LobbyMember & { teamId?: TeamId; offline?: true })[];
}

/**
 * Team mode only, to everyone: the teams and their members. In LOBBY every team of the game is
 * listed (empty ones too); from the start on, only the teams in play (those that had players).
 */
export interface LobbyTeamsPayload {
  teams: { id: TeamId; name: string; members: LobbyMember[] }[];
}

/** What a phone needs to draw a slider: never the correct value nor the margin. */
export type SliderPrompt = Pick<SliderSettings, 'min' | 'max' | 'step' | 'unit'>;

/** To the host only: full question (but not the answer, revealed by `question:reveal`). */
export interface QuestionShowPayload {
  index: number;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  /** Choice texts (MCQ, TRUE_FALSE, POLL); empty for TYPE_ANSWER / SLIDER. */
  choices: string[];
  timeLimitSec: number;
  /** SLIDER: the range shown during the question. */
  slider?: SliderPrompt;
}

/** To players only: never contains the question text or the correct answer. */
export interface QuestionPromptPayload {
  index: number;
  type: QuestionType;
  timeLimitSec: number;
  /** Choice types (MCQ, TRUE_FALSE, POLL): number of shape buttons. */
  choiceCount?: number;
  /** SLIDER: range of the slider. */
  slider?: SliderPrompt;
  /** TYPE_ANSWER: max length of the typed answer. */
  maxLength?: number;
}

export interface AnswerCountPayload {
  answered: number;
  total: number;
}

/** TYPE_ANSWER reveal: one group of typed answers (grouped after normalization). */
export interface TypedAnswerGroup {
  /** How the first player of the group typed it. */
  text: string;
  count: number;
  correct: boolean;
}

/** Type-specific part of a reveal, also saved in the game report (`QuestionResult.details`). */
export interface RevealDetails {
  /** TYPE_ANSWER: the accepted answers. */
  acceptedAnswers?: string[];
  /** TYPE_ANSWER: the most typed answers (top 6), most frequent first. */
  topAnswers?: TypedAnswerGroup[];
  /** SLIDER: the settings, correct value and margin included. */
  slider?: SliderSettings;
  /** SLIDER: every guess. */
  guesses?: number[];
  /**
   * SLIDER: the guess closest to the correct value (fastest one on a tie). `avatar` is absent in
   * games saved before avatars existed.
   */
  closest?: { nickname: string; value: number; avatar?: AvatarId };
}

export interface QuestionRevealPayload extends RevealDetails {
  type: QuestionType;
  /** Correct choice indexes (empty for POLL, TYPE_ANSWER and SLIDER). */
  correctIndexes: number[];
  /** Number of players who picked each choice index (empty for TYPE_ANSWER / SLIDER). */
  distribution: number[];
  /** SLIDER: same as `slider.correct` / `slider.margin`. */
  correct?: number;
  margin?: number;
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
  /** POLL: no right or wrong (`correct` false, 0 points, streak unchanged). */
  poll?: true;
  /** SLIDER: the player's guess (absent without an answer) and the correct value. */
  yourValue?: number;
  correctValue?: number;
}

export interface ServerToClientEvents {
  'game:state': (p: GameStatePayload) => void; // all
  'game:resuming': (p: GameResumingPayload) => void; // all
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
