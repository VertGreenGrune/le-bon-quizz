import {
  MAX_ACCEPTED_ANSWERS,
  QuizInput,
  SHAPES,
  type Choice,
  type ImageEffect,
  type Question,
  type QuestionAudio,
  type QuestionType,
  type QuizDetail,
} from '@lbq/shared';
import { validate, type FieldErrors, type Validation } from '../api/validation';

/**
 * Editor model of one question: the fields of every question type at once, so switching type
 * keeps what was typed. Only the fields of `type` are sent (see `validateDraft`).
 */
export interface DraftQuestion {
  text: string;
  imageUrl?: string;
  type: QuestionType;
  timeLimitSec: number;
  basePoints: Question['basePoints'];
  /** MCQ, TRUE_FALSE, POLL (`isCorrect` ignored for a poll). */
  choices: Choice[];
  /** TYPE_ANSWER: 1–3 accepted answers. */
  acceptedAnswers: string[];
  typoTolerance: boolean;
  /** SLIDER. A number field being edited may be NaN (empty input). */
  slider: { min: number; max: number; step: number; correct: number; margin: number; unit: string };
  /** Sound clip (any type), played on the host screen. */
  audio?: QuestionAudio;
  audioOnReveal: boolean;
  /** Picture reveal effect; only sent with an image. */
  imageEffect: ImageEffect;
}

/**
 * A `QuizInput` that may be invalid while being edited (empty texts, no correct answer…).
 * Validated with the shared `QuizInput` schema only on save. All helpers are pure.
 */
export type QuizDraft = Omit<QuizInput, 'questions'> & { questions: DraftQuestion[] };

export const MIN_CHOICES = 2;
/** One choice per answer shape (matches `QuestionSchema.choices.max`). */
export const MAX_CHOICES = SHAPES.length;
export { MAX_ACCEPTED_ANSWERS };
export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 180, 240] as const;
export const POINTS_OPTIONS = [
  { value: 1000, label: 'Standard (1000)' },
  { value: 2000, label: 'Double (2000)' },
  { value: 0, label: 'Aucun point' },
] as const;

export const QUESTION_TYPES: { type: QuestionType; label: string }[] = [
  { type: 'MCQ', label: 'Choix multiple' },
  { type: 'TRUE_FALSE', label: 'Vrai ou faux' },
  { type: 'TYPE_ANSWER', label: 'Réponse libre' },
  { type: 'SLIDER', label: 'Curseur' },
  { type: 'POLL', label: 'Sondage' },
];

export function newQuestion(): DraftQuestion {
  return {
    text: '',
    type: 'MCQ',
    timeLimitSec: 20,
    basePoints: 1000,
    choices: Array.from({ length: MAX_CHOICES }, () => ({ text: '', isCorrect: false })),
    acceptedAnswers: [''],
    typoTolerance: true,
    slider: { min: 0, max: 100, step: 1, correct: 50, margin: 0, unit: '' },
    audioOnReveal: false,
    imageEffect: 'none',
  };
}

export function emptyQuiz(): QuizDraft {
  return { title: '', description: '', visibility: 'PRIVATE', questions: [newQuestion()] };
}

/** A saved question in the editor model (defaults for the fields of the other types). */
export function toDraftQuestion(q: Question): DraftQuestion {
  const draft: DraftQuestion = { ...newQuestion(), text: q.text, type: q.type };
  if (q.imageUrl) draft.imageUrl = q.imageUrl;
  draft.timeLimitSec = q.timeLimitSec;
  draft.basePoints = q.basePoints;
  if (q.audio) draft.audio = q.audio;
  draft.audioOnReveal = q.audioOnReveal ?? false;
  draft.imageEffect = q.imageEffect ?? 'none';
  switch (q.type) {
    case 'TYPE_ANSWER':
      return { ...draft, acceptedAnswers: q.acceptedAnswers, typoTolerance: q.typoTolerance };
    case 'SLIDER':
      return { ...draft, slider: { ...q.slider, unit: q.slider.unit ?? '' } };
    case 'POLL':
      return { ...draft, choices: q.choices.map((c) => ({ text: c.text, isCorrect: false })) };
    default:
      return { ...draft, choices: q.choices.map((c) => ({ ...c })) };
  }
}

export function fromDetail(quiz: QuizDetail): QuizDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = quiz;
  return {
    ...input,
    description: input.description ?? '',
    questions: input.questions.map(toDraftQuestion),
  };
}

/** Indexes of the choices sent for `q`: empty, non-correct choices are dropped (min 2 kept). */
function keptChoices(q: DraftQuestion): number[] {
  const all = q.choices.map((_, i) => i);
  if (q.type === 'TRUE_FALSE') return all;
  const kept = all.filter(
    (i) => q.choices[i]!.text.trim() !== '' || (q.type === 'MCQ' && q.choices[i]!.isCorrect),
  );
  return kept.length >= MIN_CHOICES ? kept : all;
}

/** Indexes of the accepted answers sent: empty ones are dropped (at least one kept). */
function keptAnswers(q: DraftQuestion): number[] {
  const kept = q.acceptedAnswers.flatMap((a, i) => (a.trim() ? [i] : []));
  return kept.length > 0 ? kept : [0];
}

/** The API body of one question: only the fields of its type. */
function questionBody(q: DraftQuestion, choices: number[], answers: number[]): unknown {
  const base = {
    text: q.text,
    imageUrl: q.imageUrl || undefined,
    type: q.type,
    timeLimitSec: q.timeLimitSec,
    basePoints: q.basePoints,
    audio: q.audio,
    audioOnReveal: q.audio && q.audioOnReveal ? true : undefined,
    // An effect without a picture (removed after choosing it) is dropped.
    imageEffect: q.imageUrl && q.imageEffect !== 'none' ? q.imageEffect : undefined,
  };
  switch (q.type) {
    case 'TYPE_ANSWER':
      return {
        ...base,
        acceptedAnswers: answers.map((i) => q.acceptedAnswers[i]),
        typoTolerance: q.typoTolerance,
      };
    case 'SLIDER':
      return { ...base, slider: { ...q.slider, unit: q.slider.unit.trim() || undefined } };
    case 'POLL':
      return { ...base, choices: choices.map((i) => ({ text: q.choices[i]!.text })) };
    default:
      return { ...base, choices: choices.map((i) => q.choices[i]) };
  }
}

/**
 * Body sent to the API: drops empty optional strings, empty extra choices / accepted answers
 * and the fields of the other types, then validates with `QuizInput`. Error paths always refer
 * to the draft's own choice / answer indexes.
 */
export function validateDraft(draft: QuizDraft): Validation<QuizInput> {
  const description = draft.description?.trim();
  const kept = draft.questions.map((q) => ({
    choices: keptChoices(q),
    acceptedAnswers: keptAnswers(q),
  }));
  const result = validate(QuizInput, {
    ...draft,
    description: description ? description : undefined,
    questions: draft.questions.map((q, qi) =>
      questionBody(q, kept[qi]!.choices, kept[qi]!.acceptedAnswers),
    ),
  });
  if (result.ok) return result;
  const errors: FieldErrors = {};
  for (const [key, message] of Object.entries(result.errors)) {
    const m = /^questions\.(\d+)\.(choices|acceptedAnswers)\.(\d+)(.*)$/.exec(key);
    const list = m ? kept[Number(m[1])]?.[m[2] as 'choices' | 'acceptedAnswers'] : undefined;
    const original = m ? `questions.${m[1]}.${m[2]}.${list?.[Number(m[3])] ?? m[3]}${m[4]}` : key;
    errors[original] = message;
  }
  return { ok: false, errors };
}

/** The quiz shares uploaded pictures or sounds (copyright warning when it is made public). */
export function hasMedia(draft: QuizDraft): boolean {
  return !!draft.coverImageUrl || draft.questions.some((q) => q.imageUrl || q.audio);
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
  patch: Partial<DraftQuestion>,
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
  questions.splice(index + 1, 0, {
    ...q,
    choices: q.choices.map((c) => ({ ...c })),
    acceptedAnswers: [...q.acceptedAnswers],
    slider: { ...q.slider },
  });
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

/**
 * Switching to true/false sets the choices to « Vrai » / « Faux », keeping one correct answer;
 * a poll gives no points. The fields of the other types are kept for a switch back.
 */
export function setQuestionType(q: DraftQuestion, type: QuestionType): DraftQuestion {
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
  if (type === 'POLL') return { ...q, type, basePoints: 0 };
  // Leaving a poll: back to the standard points.
  return { ...q, type, basePoints: q.type === 'POLL' && q.basePoints === 0 ? 1000 : q.basePoints };
}

// ---------- Choices ----------

export function updateChoice(
  q: DraftQuestion,
  index: number,
  patch: Partial<Choice>,
): DraftQuestion {
  const c = q.choices[index];
  if (!c) return q;
  return { ...q, choices: replaceAt(q.choices, index, { ...c, ...patch }) };
}

/** MCQ: several answers may be correct. True/false: exactly one, so toggling is exclusive. */
export function toggleCorrect(q: DraftQuestion, index: number): DraftQuestion {
  if (q.type === 'TRUE_FALSE') {
    return { ...q, choices: q.choices.map((c, i) => ({ ...c, isCorrect: i === index })) };
  }
  return updateChoice(q, index, { isCorrect: !q.choices[index]?.isCorrect });
}

export function addChoice(q: DraftQuestion): DraftQuestion {
  if (q.type === 'TRUE_FALSE' || q.choices.length >= MAX_CHOICES) return q;
  return { ...q, choices: [...q.choices, { text: '', isCorrect: false }] };
}

export function removeChoice(q: DraftQuestion, index: number): DraftQuestion {
  if (q.type === 'TRUE_FALSE' || q.choices.length <= MIN_CHOICES) return q;
  return { ...q, choices: q.choices.filter((_, i) => i !== index) };
}

// ---------- Typed answers ----------

export function updateAcceptedAnswer(q: DraftQuestion, index: number, text: string): DraftQuestion {
  return { ...q, acceptedAnswers: replaceAt(q.acceptedAnswers, index, text) };
}

export function addAcceptedAnswer(q: DraftQuestion): DraftQuestion {
  if (q.acceptedAnswers.length >= MAX_ACCEPTED_ANSWERS) return q;
  return { ...q, acceptedAnswers: [...q.acceptedAnswers, ''] };
}

export function removeAcceptedAnswer(q: DraftQuestion, index: number): DraftQuestion {
  if (q.acceptedAnswers.length <= 1) return q;
  return { ...q, acceptedAnswers: q.acceptedAnswers.filter((_, i) => i !== index) };
}

// ---------- Slider ----------

export function updateSlider(
  q: DraftQuestion,
  patch: Partial<DraftQuestion['slider']>,
): DraftQuestion {
  return { ...q, slider: { ...q.slider, ...patch } };
}
