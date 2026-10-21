/**
 * REST API contract (prefix `/api`) — see docs/PLAN.md §6.
 * Request bodies are zod schemas (validated on the server); responses are plain types.
 * Dates are ISO 8601 strings in JSON.
 */
import { z } from 'zod';
import { QuizSchema, type Quiz, type QuestionType } from './quiz.js';
import type { GameMode, TeamId } from './game.js';
import type { RevealDetails } from './events.js';

// ---------- Errors ----------

export const ApiErrorCode = z.enum([
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'INVALID_CREDENTIALS',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Body of every non-2xx response. */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

// ---------- Auth ----------

export const PASSWORD_MIN_LENGTH = 8;

/** Emails are trimmed and lowercased before validation, so lookups are case-insensitive. */
const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const RegisterBody = z.object({
  email: Email,
  name: z.string().trim().min(1).max(60),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
});
export const LoginBody = z.object({
  email: Email,
  password: z.string().min(1).max(128),
});
export type RegisterBody = z.infer<typeof RegisterBody>;
export type LoginBody = z.infer<typeof LoginBody>;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/**
 * Response of `POST /auth/register` and `POST /auth/login`. The token is also set as an
 * httpOnly cookie (`lbq_session`); either the cookie or `Authorization: Bearer <token>` works.
 */
export interface AuthResponse {
  user: PublicUser;
  token: string;
}

// ---------- Quizzes ----------

/** Body of `POST /quizzes` and `PUT /quizzes/:id` (PUT replaces all questions). */
export const QuizInput = QuizSchema.omit({ id: true });
export type QuizInput = z.infer<typeof QuizInput>;

export interface QuizSummary {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Response of `GET /quizzes/:id` (and of POST/PUT/duplicate). */
export type QuizDetail = Quiz & { createdAt: string; updatedAt: string };

// ---------- Uploads ----------

/** `POST /uploads/image` takes multipart/form-data with one `file` field. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export interface UploadImageResponse {
  url: string;
}

// ---------- Games (history / reports) ----------

export interface GameSummary {
  id: string;
  /** Null when the quiz was deleted after the game. */
  quizId: string | null;
  quizTitle: string;
  pin: string;
  startedAt: string;
  endedAt: string | null;
  playerCount: number;
  /** Nickname of the rank-1 player (first one if tied), null without players. */
  winner: string | null;
  mode: GameMode;
}

export interface GameReportRow {
  rank: number;
  nickname: string;
  score: number;
  correctCount: number;
  /** Team mode: the player's team (null in solo games). */
  teamId: TeamId | null;
}

/** Team mode: final standing of one team. */
export interface GameTeamReport {
  teamId: TeamId;
  name: string;
  /** Sum of the team's per-question averages (PLAN.md §3). */
  score: number;
  playerCount: number;
  rank: number;
}

/** How one question went (snapshot of the question as it was played). */
export interface GameQuestionReport {
  /** Position in the quiz (0-based). */
  index: number;
  /** `MCQ` for games saved before question types existed. */
  type: QuestionType;
  text: string;
  /** Choice texts (empty for TYPE_ANSWER / SLIDER). */
  choices: string[];
  /** Empty for POLL, TYPE_ANSWER and SLIDER. */
  correctIndexes: number[];
  /** Players per choice, same order as `choices`. */
  distribution: number[];
  /** Players in the game at the reveal, answered or not. */
  playerCount: number;
  /** Always 0 for POLL (no right answer). */
  correctCount: number;
  /** Players who answered (typed answers / slider guesses included). */
  answerCount: number;
  /** TYPE_ANSWER / SLIDER: same as in `question:reveal` (accepted answers, guesses…). */
  details: RevealDetails;
}

/** `questions` is empty for games saved before per-question results existed. */
export type GameReport = GameSummary & {
  results: GameReportRow[];
  questions: GameQuestionReport[];
  /** Team ranking, best first; empty for solo games. */
  teams: GameTeamReport[];
};
