/** Test helpers (not used by the app). */
import { DEMO_QUIZ, type AnswerInput, type Question, type Quiz } from '@lbq/shared';

type ClassicQuestion = Extract<Question, { type: 'MCQ' | 'TRUE_FALSE' }>;

/** The demo quiz without the poll / typed / slider questions: always one right choice. */
export const CLASSIC_QUIZ: Quiz & { questions: ClassicQuestion[] } = {
  ...DEMO_QUIZ,
  questions: DEMO_QUIZ.questions.filter(
    (q): q is ClassicQuestion => q.type === 'MCQ' || q.type === 'TRUE_FALSE',
  ),
};

/** A right answer to any question (a poll has none: its first choice). */
export function rightAnswer(q: Question): AnswerInput {
  switch (q.type) {
    case 'TYPE_ANSWER':
      return { text: q.acceptedAnswers[0]! };
    case 'SLIDER':
      return { value: q.slider.correct };
    case 'POLL':
      return { choiceIndex: 0 };
    default:
      return { choiceIndex: q.choices.findIndex((c) => c.isCorrect) };
  }
}

/** A wrong answer to any question (a poll has none: its last choice). */
export function wrongAnswer(q: Question): AnswerInput {
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
      return { choiceIndex: q.choices.findIndex((c) => !c.isCorrect) };
  }
}
