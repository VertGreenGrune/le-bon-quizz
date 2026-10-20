import {
  QuizInput,
  SHAPES,
  type Choice,
  type Question,
  type QuestionType,
  type QuizDetail,
} from '@lbq/shared';
import { validate, type FieldErrors, type Validation } from '../api/validation';

/**
 * Editor model: a `QuizInput` that may be invalid while being edited (empty texts, no correct
 * answer…). Validated with the shared `QuizInput` schema only on save. All helpers are pure.
 */
export type QuizDraft = QuizInput;

export const MIN_CHOICES = 2;
/** One choice per answer shape (matches `QuestionSchema.choices.max`). */
export const MAX_CHOICES = SHAPES.length;
export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 180, 240] as const;
export const POINTS_OPTIONS = [
  { value: 1000, label: 'Standard (1000)' },
  { value: 2000, label: 'Double (2000)' },
  { value: 0, label: 'Aucun point' },
] as const;

export function newQuestion(): Question {
  return {
    text: '',
    type: 'MCQ',
    timeLimitSec: 20,
    basePoints: 1000,
    choices: Array.from({ length: MAX_CHOICES }, () => ({ text: '', isCorrect: false })),
  };
}

export function emptyQuiz(): QuizDraft {
  return { title: '', description: '', questions: [newQuestion()] };
}

export function fromDetail(quiz: QuizDetail): QuizDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = quiz;
  return { ...input, description: input.description ?? '' };
}

/** Indexes of the choices sent for `q`: empty, non-correct MCQ choices are dropped (min 2 kept). */
function keptChoices(q: Question): number[] {
  const all = q.choices.map((_, i) => i);
  if (q.type === 'TRUE_FALSE') return all;
  const kept = all.filter((i) => q.choices[i]!.text.trim() !== '' || q.choices[i]!.isCorrect);
  return kept.length >= MIN_CHOICES ? kept : all;
}

/**
 * Body sent to the API: drops empty optional strings and empty extra choices, then validates
 * with `QuizInput`. Error paths always refer to the draft's own choice indexes.
 */
export function validateDraft(draft: QuizDraft): Validation<QuizInput> {
  const description = draft.description?.trim();
  const kept = draft.questions.map(keptChoices);
  const result = validate(QuizInput, {
    ...draft,
    description: description ? description : undefined,
    questions: draft.questions.map((q, qi) => ({
      ...q,
      imageUrl: q.imageUrl || undefined,
      choices: kept[qi]!.map((ci) => q.choices[ci]),
    })),
  });
  if (result.ok) return result;
  const errors: FieldErrors = {};
  for (const [key, message] of Object.entries(result.errors)) {
    const m = /^questions\.(\d+)\.choices\.(\d+)(.*)$/.exec(key);
    const original = m
      ? `questions.${m[1]}.choices.${kept[Number(m[1])]?.[Number(m[2])] ?? m[2]}${m[3]}`
      : key;
    errors[original] = message;
  }
  return { ok: false, errors };
}

/** Number of errors of question `index` (for the sidebar badges). */
export function questionErrorCount(errors: FieldErrors, index: number): number {
  const prefix = `questions.${index}`;
  return Object.keys(errors).filter((k) => k === prefix || k.startsWith(`${prefix}.`)).length;
}

// ---------- Questions ----------

const replaceAt = <T>(list: readonly T[], index: number, item: T): T[] =>
  list.map((x, i) => (i === index ? item : x));

export function updateQuestion(
  draft: QuizDraft,
  index: number,
  patch: Partial<Question>,
): QuizDraft {
  const q = draft.questions[index];
  if (!q) return draft;
  return { ...draft, questions: replaceAt(draft.questions, index, { ...q, ...patch }) };
}

export function addQuestion(draft: QuizDraft, after = draft.questions.length - 1): QuizDraft {
  const questions = [...draft.questions];
  questions.splice(after + 1, 0, newQuestion());
  return { ...draft, questions };
}

export function duplicateQuestion(draft: QuizDraft, index: number): QuizDraft {
  const q = draft.questions[index];
  if (!q) return draft;
  const questions = [...draft.questions];
  questions.splice(index + 1, 0, { ...q, choices: q.choices.map((c) => ({ ...c })) });
  return { ...draft, questions };
}

/** Keeps at least one question (an empty one replaces the last). */
export function removeQuestion(draft: QuizDraft, index: number): QuizDraft {
  const questions = draft.questions.filter((_, i) => i !== index);
  return { ...draft, questions: questions.length ? questions : [newQuestion()] };
}

export function moveQuestion(draft: QuizDraft, from: number, to: number): QuizDraft {
  if (to < 0 || to >= draft.questions.length || from === to) return draft;
  const questions = [...draft.questions];
  const [q] = questions.splice(from, 1);
  questions.splice(to, 0, q!);
  return { ...draft, questions };
}

/** Switching to true/false sets the choices to « Vrai » / « Faux », keeping one correct answer. */
export function setQuestionType(q: Question, type: QuestionType): Question {
  if (type === q.type) return q;
  if (type === 'TRUE_FALSE') {
    const falseCorrect = q.choices[1]?.isCorrect === true && q.choices[0]?.isCorrect !== true;
    return {
      ...q,
      type,
      choices: [
        { text: 'Vrai', isCorrect: !falseCorrect && q.choices.some((c) => c.isCorrect) },
        { text: 'Faux', isCorrect: falseCorrect },
      ],
    };
  }
  return { ...q, type };
}

// ---------- Choices ----------

export function updateChoice(q: Question, index: number, patch: Partial<Choice>): Question {
  const c = q.choices[index];
  if (!c) return q;
  return { ...q, choices: replaceAt(q.choices, index, { ...c, ...patch }) };
}

/** MCQ: several answers may be correct. True/false: exactly one, so toggling is exclusive. */
export function toggleCorrect(q: Question, index: number): Question {
  if (q.type === 'TRUE_FALSE') {
    return { ...q, choices: q.choices.map((c, i) => ({ ...c, isCorrect: i === index })) };
  }
  return updateChoice(q, index, { isCorrect: !q.choices[index]?.isCorrect });
}

export function addChoice(q: Question): Question {
  if (q.type === 'TRUE_FALSE' || q.choices.length >= MAX_CHOICES) return q;
  return { ...q, choices: [...q.choices, { text: '', isCorrect: false }] };
}

export function removeChoice(q: Question, index: number): Question {
  if (q.type === 'TRUE_FALSE' || q.choices.length <= MIN_CHOICES) return q;
  return { ...q, choices: q.choices.filter((_, i) => i !== index) };
}
