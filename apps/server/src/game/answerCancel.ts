import { MAX_ANSWER_CANCELS, answerCancellable, type Question } from '@lbq/shared';
import { GameError } from './errors.js';

/**
 * « Annuler ma réponse » (T43, PLAN.md §3): which answers can be cancelled, and how many times.
 * The removal itself (and the Copieur copies that follow it) is in `Game.unanswer`.
 */

const refuse = (message: string) => new GameError('CANCEL_REFUSED', message);

/** Throws when the current question's answers can't be cancelled. */
export function checkCancellable(q: Question): void {
  if (answerCancellable(q.type, q.buzzer)) return;
  if (q.buzzer) throw refuse('Pas d’annulation au buzzer');
  if (q.type === 'DRAW') throw refuse('Propose simplement un autre mot');
  throw refuse('La réponse d’un « Mytho ! » ne s’annule pas (le mytho se change tant qu’on écrit)');
}

/** Cancels used per player on the current question (reset at each question). */
export class AnswerCancels {
  private readonly used = new Map<string, number>();

  reset(): void {
    this.used.clear();
  }

  /** Counts one cancel; throws once MAX_ANSWER_CANCELS were used. Returns the cancels left. */
  take(playerId: string): number {
    const used = this.used.get(playerId) ?? 0;
    if (used >= MAX_ANSWER_CANCELS)
      throw refuse(`Tu as déjà annulé ${MAX_ANSWER_CANCELS} fois sur cette question`);
    this.used.set(playerId, used + 1);
    return MAX_ANSWER_CANCELS - used - 1;
  }

  left(playerId: string): number {
    return MAX_ANSWER_CANCELS - (this.used.get(playerId) ?? 0);
  }
}
