import { POTATO_MAX_CHOICES, POTATO_MIN_CHOICES, POTATO_MIN_QUESTIONS } from '@lbq/shared';
import { newPotatoSub, type DraftQuestion, type PotatoDraftSub } from './draft';

/** « Patate chaude » editor helpers (pure): the sub-questions of a question. */

function withSubs(q: DraftQuestion, potatoQuestions: PotatoDraftSub[]): DraftQuestion {
  return { ...q, potatoQuestions };
}

export function updateSub(
  q: DraftQuestion,
  index: number,
  change: Partial<PotatoDraftSub>,
): DraftQuestion {
  return withSubs(
    q,
    q.potatoQuestions.map((s, i) => (i === index ? { ...s, ...change } : s)),
  );
}

export function setSubChoice(
  q: DraftQuestion,
  index: number,
  choice: number,
  text: string,
): DraftQuestion {
  const sub = q.potatoQuestions[index]!;
  return updateSub(q, index, { choices: sub.choices.map((c, i) => (i === choice ? text : c)) });
}

export function addSub(q: DraftQuestion): DraftQuestion {
  return withSubs(q, [...q.potatoQuestions, newPotatoSub()]);
}

/** Removes a sub-question (at least POTATO_MIN_QUESTIONS stay). */
export function removeSub(q: DraftQuestion, index: number): DraftQuestion {
  if (q.potatoQuestions.length <= POTATO_MIN_QUESTIONS) return q;
  return withSubs(
    q,
    q.potatoQuestions.filter((_, i) => i !== index),
  );
}

export function addSubChoice(q: DraftQuestion, index: number): DraftQuestion {
  const sub = q.potatoQuestions[index]!;
  if (sub.choices.length >= POTATO_MAX_CHOICES) return q;
  return updateSub(q, index, { choices: [...sub.choices, ''] });
}

/** Removes a choice; the right answer follows it (or falls back to the first one). */
export function removeSubChoice(q: DraftQuestion, index: number, choice: number): DraftQuestion {
  const sub = q.potatoQuestions[index]!;
  if (sub.choices.length <= POTATO_MIN_CHOICES) return q;
  const correct = sub.correct === choice ? 0 : sub.correct > choice ? sub.correct - 1 : sub.correct;
  return updateSub(q, index, { choices: sub.choices.filter((_, i) => i !== choice), correct });
}

/** The fuse range: moving one end past the other drags it along. */
export function setFuse(q: DraftQuestion, end: 'min' | 'max', sec: number): DraftQuestion {
  if (end === 'min') return { ...q, fuseMinSec: sec, fuseMaxSec: Math.max(sec, q.fuseMaxSec) };
  return { ...q, fuseMaxSec: sec, fuseMinSec: Math.min(sec, q.fuseMinSec) };
}
