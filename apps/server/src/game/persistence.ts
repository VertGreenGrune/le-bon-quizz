import { DEMO_QUIZ, type Quiz } from '@lbq/shared';
import { getQuizForOwner } from '../api/quizzes.service.js';
import { getUserBySessionToken } from '../auth/session.js';
import type { PrismaClient } from '../db.js';
import { GameError } from './errors.js';
import type { Game, PlayerStanding } from './Game.js';

/** A quiz ready to be played, and the DB row it comes from (null for the built-in demo). */
export interface LoadedQuiz {
  quiz: Quiz;
  dbQuizId: string | null;
}

/** What is saved when a game ends (`GameSession` + its `PlayerResult`s). */
export interface GameRecord {
  hostId: string;
  quizId: string | null;
  quizTitle: string;
  pin: string;
  startedAt: Date;
  endedAt: Date;
  results: PlayerStanding[];
}

/** Everything the game layer needs from the outside world (DB, auth). */
export interface GamePersistence {
  /** Host user id for a session token (`lbq_session` cookie), or null. */
  authenticate(token: string): Promise<string | null>;
  /**
   * Quiz for `host:create`. Logged-in hosts get their own quizzes; quiz `demo` also works
   * without login (built-in `DEMO_QUIZ`). Throws `UNAUTHORIZED` / `QUIZ_NOT_FOUND`.
   */
  loadQuiz(quizId: string, hostId: string | null): Promise<LoadedQuiz>;
  saveGame(record: GameRecord): Promise<void>;
}

function demoOr(quizId: string, hostId: string | null): LoadedQuiz {
  if (quizId === DEMO_QUIZ.id) return { quiz: DEMO_QUIZ, dbQuizId: null };
  if (!hostId) throw new GameError('UNAUTHORIZED', 'Connecte-toi pour lancer ce quiz');
  throw new GameError('QUIZ_NOT_FOUND', 'Quiz introuvable');
}

/** No database: only the demo quiz, nothing is saved (unit tests, phase 1). */
export const demoOnlyPersistence: GamePersistence = {
  authenticate: async () => null,
  loadQuiz: async (quizId, hostId) => demoOr(quizId, hostId),
  saveGame: async () => {},
};

export function createPrismaPersistence(prisma: PrismaClient): GamePersistence {
  return {
    async authenticate(token) {
      return (await getUserBySessionToken(prisma, token))?.id ?? null;
    },

    async loadQuiz(quizId, hostId) {
      // A logged-in host playing `demo` gets their own (seeded, maybe edited) copy if they own it.
      const owned = hostId ? await getQuizForOwner(prisma, quizId, hostId) : null;
      if (!owned) return demoOr(quizId, hostId);
      const { createdAt: _c, updatedAt: _u, ...quiz } = owned;
      return { quiz: { ...quiz, id: quizId }, dbQuizId: quizId };
    },

    async saveGame(r) {
      // The quiz may have been deleted during the game: keep the history without the link.
      const quizExists =
        r.quizId !== null && (await prisma.quiz.count({ where: { id: r.quizId } })) > 0;
      await prisma.gameSession.create({
        data: {
          hostId: r.hostId,
          quizId: quizExists ? r.quizId : null,
          quizTitle: r.quizTitle,
          pin: r.pin,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          results: { create: r.results },
        },
      });
    },
  };
}

/**
 * The record to save for an ENDED game, or null when there is nothing worth keeping:
 * anonymous host (demo without login) or a game that never left the lobby.
 */
export function gameRecord(
  game: Game,
  hostId: string | null,
  dbQuizId: string | null,
): GameRecord | null {
  if (!hostId || !game.startedAt) return null;
  return {
    hostId,
    quizId: dbQuizId,
    quizTitle: game.quiz.title,
    pin: game.pin,
    startedAt: game.startedAt,
    endedAt: new Date(),
    results: game.standings(),
  };
}
