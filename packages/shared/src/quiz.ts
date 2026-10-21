import { z } from 'zod';

/**
 * - `MCQ` / `TRUE_FALSE`: shape buttons, one or more correct choices.
 * - `TYPE_ANSWER` (réponse libre): players type their answer, matched on the server.
 * - `POLL` (sondage): shape buttons, no correct answer, 0 points, streak unchanged.
 * - `SLIDER` (curseur): players guess a number, correct within ± `margin`.
 */
export const QuestionType = z.enum(['MCQ', 'TRUE_FALSE', 'TYPE_ANSWER', 'POLL', 'SLIDER']);
export type QuestionType = z.infer<typeof QuestionType>;

/** Types answered with the shape buttons (`choices`). */
export const CHOICE_QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'POLL'] as const;
export type ChoiceQuestionType = (typeof CHOICE_QUESTION_TYPES)[number];

export const TYPE_ANSWER_MAX_LENGTH = 40;
export const MAX_ACCEPTED_ANSWERS = 3;
/** A slider has at most this many positions ((max − min) / step). */
export const SLIDER_MAX_STEPS = 100_000;

export const BasePoints = z.union([z.literal(0), z.literal(1000), z.literal(2000)]);

export const ChoiceSchema = z.object({
  text: z.string().trim().min(1).max(75),
  isCorrect: z.boolean(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

/** A poll choice has no right or wrong. */
export const PollChoiceSchema = z.object({ text: z.string().trim().min(1).max(75) });

export const AUDIO_MIN_DURATION_SEC = 5;
export const AUDIO_MAX_DURATION_SEC = 30;
export const AUDIO_DEFAULT_DURATION_SEC = 15;
/** Latest start inside the audio file (1 hour). */
export const AUDIO_MAX_START_SEC = 3600;

/**
 * Sound clip of a question (blind test), played on the host screen only: the excerpt
 * [startSec, startSec + durationSec] of the uploaded file, looped while answering.
 */
export const QuestionAudioSchema = z.object({
  url: z.string().url(),
  startSec: z.number().min(0).max(AUDIO_MAX_START_SEC).default(0),
  durationSec: z
    .number()
    .int()
    .min(AUDIO_MIN_DURATION_SEC)
    .max(AUDIO_MAX_DURATION_SEC)
    .default(AUDIO_DEFAULT_DURATION_SEC),
});
export type QuestionAudio = z.infer<typeof QuestionAudioSchema>;

/**
 * The question's picture starts unrecognisable and becomes clear over the answering time
 * (host screen only): `blur` 30 px → 0, `zoom` ×6 on a point → ×1, `pixelate` 8 blocks → full.
 */
export const ImageEffect = z.enum(['none', 'blur', 'zoom', 'pixelate']);
export type ImageEffect = z.infer<typeof ImageEffect>;

const questionBase = {
  text: z.string().trim().min(1).max(120),
  imageUrl: z.string().url().optional(),
  timeLimitSec: z.number().int().min(5).max(240).default(20),
  basePoints: BasePoints.default(1000),
  audio: QuestionAudioSchema.optional(),
  /** Play the clip at REVEAL instead of during ANSWERING (e.g. "listen to the answer"). */
  audioOnReveal: z.boolean().optional(),
  imageEffect: ImageEffect.optional(),
};

const hasCorrectChoice: [
  (q: { choices: Choice[] }) => boolean,
  { message: string; path: PropertyKey[] },
] = [
  (q) => q.choices.some((c) => c.isCorrect),
  { message: 'At least one choice must be correct', path: ['choices'] },
];

const McqQuestion = z
  .object({
    ...questionBase,
    type: z.literal('MCQ'),
    choices: z.array(ChoiceSchema).min(2).max(4),
  })
  .refine(...hasCorrectChoice);

const TrueFalseQuestion = z
  .object({
    ...questionBase,
    type: z.literal('TRUE_FALSE'),
    choices: z.array(ChoiceSchema).min(2).max(4),
  })
  .refine(...hasCorrectChoice)
  .refine((q) => q.choices.length === 2, {
    message: 'True/false questions have exactly 2 choices',
    path: ['choices'],
  });

const PollQuestion = z.object({
  ...questionBase,
  type: z.literal('POLL'),
  choices: z.array(PollChoiceSchema).min(2).max(4),
});

const TypeAnswerQuestion = z.object({
  ...questionBase,
  type: z.literal('TYPE_ANSWER'),
  acceptedAnswers: z
    .array(z.string().trim().min(1).max(TYPE_ANSWER_MAX_LENGTH))
    .min(1)
    .max(MAX_ACCEPTED_ANSWERS),
  /** Accept small typos (PLAN.md §3). */
  typoTolerance: z.boolean().default(true),
});

/** `value` is a multiple of `step` from `min` (with a float tolerance: steps like 0.1). */
export function isOnStep(value: number, min: number, step: number): boolean {
  const k = (value - min) / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

export const SliderSettingsSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    step: z.number().positive().default(1),
    correct: z.number(),
    /** Guesses within ± margin are correct (0 = exact only). */
    margin: z.number().min(0).default(0),
    unit: z.string().trim().max(10).optional(),
  })
  .refine((s) => s.min < s.max, { message: 'Min must be below max', path: ['max'] })
  .refine((s) => (s.max - s.min) / s.step <= SLIDER_MAX_STEPS, {
    message: 'Too many steps',
    path: ['step'],
  })
  .refine((s) => s.correct >= s.min && s.correct <= s.max, {
    message: 'Correct value out of range',
    path: ['correct'],
  })
  .refine((s) => isOnStep(s.correct, s.min, s.step), {
    message: 'Correct value not on a step',
    path: ['correct'],
  });
export type SliderSettings = z.infer<typeof SliderSettingsSchema>;

const SliderQuestion = z.object({
  ...questionBase,
  type: z.literal('SLIDER'),
  slider: SliderSettingsSchema,
});

export const QuestionSchema = z.preprocess(
  // `type` used to be optional (default MCQ): keep accepting questions without it.
  (q) => (q && typeof q === 'object' && !('type' in q) ? { ...q, type: 'MCQ' } : q),
  z
    .discriminatedUnion('type', [
      McqQuestion,
      TrueFalseQuestion,
      TypeAnswerQuestion,
      PollQuestion,
      SliderQuestion,
    ])
    .refine((q) => !q.imageEffect || q.imageEffect === 'none' || !!q.imageUrl, {
      message: 'An image effect needs an image',
      path: ['imageEffect'],
    }),
);
export type Question = z.infer<typeof QuestionSchema>;
export type ChoiceQuestion = Extract<Question, { type: ChoiceQuestionType }>;
export type TypeAnswerQuestion = Extract<Question, { type: 'TYPE_ANSWER' }>;
export type SliderQuestion = Extract<Question, { type: 'SLIDER' }>;

export function isChoiceQuestion(q: Question): q is ChoiceQuestion {
  return (CHOICE_QUESTION_TYPES as readonly string[]).includes(q.type);
}

/** Choice texts (empty for typed / slider questions). */
export function choiceTexts(q: Question): string[] {
  return isChoiceQuestion(q) ? q.choices.map((c) => c.text) : [];
}

/** Indexes of the correct choices (empty for polls, typed and slider questions). */
export function correctChoiceIndexes(q: Question): number[] {
  if (q.type !== 'MCQ' && q.type !== 'TRUE_FALSE') return [];
  return q.choices.flatMap((c, i) => (c.isCorrect ? [i] : []));
}

/**
 * `PRIVATE`: only its owner can launch it. `PUBLIC`: listed in the library, any logged-in host
 * can launch or copy it (only the owner can edit it).
 */
export const QuizVisibility = z.enum(['PRIVATE', 'PUBLIC']);
export type QuizVisibility = z.infer<typeof QuizVisibility>;

export const QuizSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(95),
  description: z.string().max(500).optional(),
  coverImageUrl: z.string().url().optional(),
  questions: z.array(QuestionSchema).min(1).max(100),
});
export type Quiz = z.infer<typeof QuizSchema>;
