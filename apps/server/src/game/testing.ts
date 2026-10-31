/** Test helpers (not used by the app). */
import {
  DEMO_QUIZ,
  correctChoiceIndexes,
  isMultipleAnswer,
  type AnswerInput,
  type Question,
  type Quiz,
} from '@lbq/shared';
import type { Game } from './Game.js';
import { isExtraQuestion } from './questionTypes/index.js';

type ClassicQuestion = Extract<Question, { type: 'MCQ' | 'TRUE_FALSE' }>;

/** The demo quiz without the poll / typed / slider questions: always one right choice. */
export const CLASSIC_QUIZ: Quiz & { questions: ClassicQuestion[] } = {
  ...DEMO_QUIZ,
  questions: DEMO_QUIZ.questions.filter(
    (q): q is ClassicQuestion => q.type === 'MCQ' || q.type === 'TRUE_FALSE',
  ),
};

/**
 * A right answer to a question of the older types (a poll has none: its first choice). The types
 * of `questionTypes/` depend on the prompt (ORDER shuffle) or the players: not supported.
 */
export function rightAnswer(q: Question): AnswerInput {
  if (isExtraQuestion(q)) throw new Error(`rightAnswer: unsupported type ${q.type}`);
  switch (q.type) {
    case 'TYPE_ANSWER':
      return { text: q.acceptedAnswers[0]! };
    case 'SLIDER':
      return { value: q.slider.correct };
    case 'POLL':
      return { choiceIndex: 0 };
    default:
      if (isMultipleAnswer(q)) return { choiceIndexes: correctChoiceIndexes(q) };
      return { choiceIndex: q.choices.findIndex((c) => c.isCorrect) };
  }
}

/** A wrong answer to a question of the older types (a poll has none: its last choice). */
export function wrongAnswer(q: Question): AnswerInput {
  if (isExtraQuestion(q)) throw new Error(`wrongAnswer: unsupported type ${q.type}`);
  switch (q.type) {
    case 'TYPE_ANSWER':
      return { text: 'zzzzzz' };
    case 'SLIDER': {
      const { min, max, correct } = q.slider;
      return { value: correct - min > max - correct ? min : max };
    }
    case 'POLL':
      return { choiceIndex: q.choices.length - 1 };
    default:
      if (isMultipleAnswer(q)) return { choiceIndexes: [q.choices.findIndex((c) => !c.isCorrect)] };
      return { choiceIndex: q.choices.findIndex((c) => !c.isCorrect) };
  }
}

/** QUESTION_INTRO duration of the current question (3–12 s, T42), 0 outside the intro. */
export function introOf(game: Game): number {
  return game.statePayload().introMs ?? 0;
}
