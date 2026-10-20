import { DEMO_QUIZ, type Quiz } from '@lbq/shared';
import { GameError } from './errors.js';

/**
 * Resolves the quiz for `host:create`. Phase 1: only the hardcoded demo quiz.
 * T7 replaces this with a DB lookup (+ ownership check).
 */
export async function loadQuiz(quizId: string): Promise<Quiz> {
  if (quizId === DEMO_QUIZ.id) return DEMO_QUIZ;
  throw new GameError('QUIZ_NOT_FOUND', `Quiz "${quizId}" not found`);
}
