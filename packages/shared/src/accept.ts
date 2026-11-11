import type { Question } from './quiz.js';

/**
 * « Accepter aussi cette réponse » (T44): what the host can accept at the reveal of a question
 * whose answer was set wrong — `choice` (MCQ / TRUE_FALSE: a refused choice becomes right too),
 * `text` (TYPE_ANSWER / POINTLESS: a refused typed group) or `margin` (SLIDER: a wider margin). `null` for every
 * other type and for « Buzzer » questions (the host already judged out loud).
 */
export type AcceptKind = 'choice' | 'text' | 'margin';

export function acceptKind(q: Pick<Question, 'type' | 'buzzer'>): AcceptKind | null {
  if (q.buzzer) return null;
  switch (q.type) {
    case 'MCQ':
    case 'TRUE_FALSE':
      return 'choice';
    case 'TYPE_ANSWER':
    case 'POINTLESS':
      return 'text';
    case 'SLIDER':
      return 'margin';
    default:
      return null;
  }
}

/** Answers the host accepted on a question (`RevealDetails.accepted`, saved in the report). */
export interface AcceptedAnswers {
  /** MCQ / TRUE_FALSE: choices made right by the host (never the quiz's own right choices). */
  choiceIndexes?: number[];
  /** TYPE_ANSWER: typed answers accepted (as the first player of their group typed them). */
  texts?: string[];
  /** SLIDER: the margin used instead of the quiz's one (always wider). */
  margin?: number;
}

/**
 * Right choices once the host's accepts are added. « Select all »: the set to tick grows (a
 * player who ticked the quiz's own set stays right, see PLAN.md §3).
 */
export function acceptedChoiceIndexes(q: Question, accepted?: AcceptedAnswers): number[] {
  if (q.type !== 'MCQ' && q.type !== 'TRUE_FALSE') return [];
  const right = q.choices.flatMap((c, i) => (c.isCorrect ? [i] : []));
  return [...new Set([...right, ...(accepted?.choiceIndexes ?? [])])].sort((a, b) => a - b);
}
