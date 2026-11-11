import type { QuestionShowPayload, RevealDetails } from '@lbq/shared';

/**
 * « Qu'est-ce qui a disparu ? » (T59): which picture the TV shows. While memorizing « avant »
 * (`imageUrl`), while answering « après », at the reveal the one the host picked.
 */
export function missingStagePicture(question: QuestionShowPayload): string | undefined {
  if (question.missing?.stage === 'answer') return question.missing.missingImageUrl;
  return question.imageUrl;
}

export type MissingSide = 'avant' | 'apres';

export function missingRevealPicture(
  reveal: NonNullable<RevealDetails['missing']>,
  side: MissingSide,
): string {
  return side === 'apres' ? reveal.missingImageUrl : reveal.imageUrl;
}

/** « 2 / 3 dans la zone » — or « personne n'a répondu ». */
export function missingFoundLine(reveal: NonNullable<RevealDetails['missing']>): string {
  const total = reveal.pins.length;
  if (total === 0) return 'Personne n’a répondu';
  return `${reveal.pins.filter((p) => p.correct).length} / ${total} dans la zone`;
}
