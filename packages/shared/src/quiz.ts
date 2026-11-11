import { z } from 'zod';
import {
  COLORS_DEFAULT_CELLS,
  COLORS_DEFAULT_MEMO_SEC,
  COLORS_DEFAULT_SEC,
  COLORS_MAX_CELLS,
  COLORS_MAX_MEMO_SEC,
  COLORS_MAX_ZONES,
  COLORS_MIN_CELLS,
  COLORS_MIN_MEMO_SEC,
  COLORS_MIN_ZONES,
  ColorZoneSchema,
  colorName,
} from './colors.js';

/**
 * - `MCQ` / `TRUE_FALSE`: shape buttons, one or more correct choices.
 * - `TYPE_ANSWER` (réponse libre): players type their answer, matched on the server.
 * - `POLL` (sondage): shape buttons, no correct answer, 0 points, streak unchanged.
 * - `SLIDER` (curseur): players guess a number, correct within ± `margin`.
 * - `ORDER` (remettre dans l'ordre): players put 3–6 items in order; partial points per item.
 * - `PIN` (point sur l'image): players tap the picture (sent to the phones for this type only);
 *   correct inside the zone, partial points just outside.
 * - `WHO_OF_US` (« Qui de nous ? »): players vote for a player of the game; no right answer.
 * - `WORD_CLOUD` (nuage de mots): players type a word or two; no right answer, 0 points.
 * - `BLUFF` (« Mytho ! »): players write a fake answer, then vote for the one they think is
 *   true among the lies and the real answer (`truth`).
 * - `DRAW` (« Dessine-moi », T30): one player draws a secret word on their phone, live on the TV;
 *   the others type guesses.
 * - `LIST` (« Liste chrono », T57): players type as many items of a list as they can (« Citez les
 *   7 nains »); points per item found.
 * - `COLORS` (« Couleurs perdues », T58): a colored board on the TV, then grey: players put the
 *   colors back with a palette; points per zone right.
 * - `MISSING` (« Qu'est-ce qui a disparu ? », T59): a picture on the TV, then the same picture
 *   without one element: players tap where it was (scored like PIN).
 */
export const QuestionType = z.enum([
  'MCQ',
  'TRUE_FALSE',
  'TYPE_ANSWER',
  'POLL',
  'SLIDER',
  'ORDER',
  'PIN',
  'WHO_OF_US',
  'WORD_CLOUD',
  'BLUFF',
  'DRAW',
  'LIST',
  'COLORS',
  'MISSING',
]);
export type QuestionType = z.infer<typeof QuestionType>;

/** Types answered with the shape buttons (`choices`). */
export const CHOICE_QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'POLL'] as const;
export type ChoiceQuestionType = (typeof CHOICE_QUESTION_TYPES)[number];

/**
 * Types without a right answer: never "correct", the streak is left unchanged and no time points
 * are given (`WHO_OF_US` may give a majority bonus).
 */
export const NO_RIGHT_ANSWER_TYPES = ['POLL', 'WHO_OF_US', 'WORD_CLOUD'] as const;

export function hasRightAnswer(type: QuestionType): boolean {
  return !(NO_RIGHT_ANSWER_TYPES as readonly string[]).includes(type);
}

export const TYPE_ANSWER_MAX_LENGTH = 40;
export const WORD_CLOUD_MAX_LENGTH = 20;
export const ORDER_MIN_ITEMS = 3;
export const ORDER_MAX_ITEMS = 6;
/** « Qui de nous ? » with `majorityBonus`: points for each player who voted like the majority. */
export const WHO_OF_US_MAJORITY_BONUS = 200;
/** Smallest / largest PIN zone radius, as a fraction of the picture (see `PinZoneSchema`). */
export const PIN_MIN_RADIUS = 0.02;
export const PIN_MAX_RADIUS = 0.5;
export const MAX_ACCEPTED_ANSWERS = 10;
/** « Mytho ! »: length of the true answer and of the lies. */
export const BLUFF_MAX_LENGTH = 40;
/** « Mytho ! »: default writing time (`timeLimitSec`) and voting time (`voteTimeSec`). */
export const BLUFF_DEFAULT_WRITE_SEC = 45;
export const BLUFF_DEFAULT_VOTE_SEC = 20;
/** « Mytho ! »: each player fooled by your lie earns you this share of `basePoints` (+250)… */
export const BLUFF_FOOL_SHARE = 0.25;
/** …up to this share of `basePoints` in all (+500): a « Mytho ! » is worth at most 1500. */
export const BLUFF_FOOL_MAX_SHARE = 0.5;
/** « Dessine-moi »: words of the editor (one drawn at random; none = the built-in list). */
export const DRAW_WORD_MAX_LENGTH = 30;
export const DRAW_MAX_WORDS = 30;
/** « Dessine-moi »: default drawing time (`timeLimitSec`). */
export const DRAW_DEFAULT_SEC = 90;
/**
 * « Dessine-moi »: the drawer earns `basePoints` × the share of the guessers who found the word
 * (everyone → `basePoints`, whatever the number of players).
 */
export function drawerShare(basePoints: number, finders: number, guessers: number): number {
  return guessers > 0 ? Math.round((basePoints * Math.min(finders, guessers)) / guessers) : 0;
}
/** « Liste chrono » (T57): items of the list, default time, share of items that makes it right. */
export const LIST_MIN_ITEMS = 2;
export const LIST_MAX_ITEMS = 30;
/** One item, its other spellings included (« Prof | Professeur »). */
export const LIST_ITEM_MAX_LENGTH = 80;
export const LIST_DEFAULT_SEC = 60;
/** Found at least this share of the items = a right answer (streak, « Survie » heart). */
export const LIST_CORRECT_SHARE = 0.5;
/** « Liste chrono »: an item's spellings, separated by « | » (the first one is shown). */
export function listItemAnswers(item: string): string[] {
  return item
    .split('|')
    .map((a) => a.trim())
    .filter(Boolean);
}
/** « Liste chrono »: how an item is shown (its first spelling). */
export function listItemLabel(item: string): string {
  return listItemAnswers(item)[0] ?? item.trim();
}
/** « Liste chrono »: `basePoints` × the share of the items found (no time factor). */
export function listPoints(basePoints: number, found: number, total: number): number {
  return total > 0 ? Math.round((basePoints * Math.min(found, total)) / total) : 0;
}
/** « Liste chrono »: right when at least half of the items were found. */
export function listCorrect(found: number, total: number): boolean {
  return total > 0 && found >= Math.ceil(total * LIST_CORRECT_SHARE);
}
/** « Mytho ! »: points for fooling `fooled` players. */
export function bluffFoolPoints(basePoints: number, fooled: number): number {
  return Math.min(
    fooled * Math.round(basePoints * BLUFF_FOOL_SHARE),
    Math.round(basePoints * BLUFF_FOOL_MAX_SHARE),
  );
}
/** Explanation shown from the reveal on (TV, phones, report), every question type. */
export const EXPLANATION_MAX_LENGTH = 300;
/** A slider has at most this many positions ((max − min) / step). */
export const SLIDER_MAX_STEPS = 100_000;

/**
 * Types that can be played « au buzzer »: those with a right answer one can say out loud (not a
 * point on a picture, not a « Mytho ! »).
 */
export const BUZZER_QUESTION_TYPES = [
  'MCQ',
  'TRUE_FALSE',
  'TYPE_ANSWER',
  'SLIDER',
  'ORDER',
] as const satisfies readonly QuestionType[];

export function buzzerAllowed(type: QuestionType): boolean {
  return (BUZZER_QUESTION_TYPES as readonly string[]).includes(type);
}

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
  /**
   * « Buzzer » (T28): no answer screen on the phones, only a BUZZ button; the first player to buzz
   * answers out loud and the host judges it (`BUZZER_QUESTION_TYPES` only).
   */
  buzzer: z.boolean().optional(),
  /**
   * « 💡 Le saviez-vous ? » (T37): more about the answer, shown from REVEAL on only (it usually
   * gives the answer away). Empty = none.
   */
  explanation: z.string().trim().max(EXPLANATION_MAX_LENGTH).optional(),
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

const OrderQuestion = z
  .object({
    ...questionBase,
    type: z.literal('ORDER'),
    /** In the right order (the phones and the TV get them shuffled). */
    items: z.array(z.string().trim().min(1).max(75)).min(ORDER_MIN_ITEMS).max(ORDER_MAX_ITEMS),
  })
  .refine((q) => new Set(q.items.map((i) => i.toLocaleLowerCase())).size === q.items.length, {
    message: 'Items must be different',
    path: ['items'],
  });

/** A point on a picture: fractions of its width (`x`) and height (`y`), 0–1 from the top left. */
export const PinPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type PinPoint = z.infer<typeof PinPointSchema>;

/**
 * Correct zone of a PIN question. Distances are measured in picture fractions (x in widths, y in
 * heights), so on a non-square picture the zone is drawn as an ellipse of radii
 * `radius` × width and `radius` × height.
 */
export const PinZoneSchema = PinPointSchema.extend({
  radius: z.number().min(PIN_MIN_RADIUS).max(PIN_MAX_RADIUS),
});
export type PinZone = z.infer<typeof PinZoneSchema>;

const PinQuestion = z
  .object({ ...questionBase, type: z.literal('PIN'), zone: PinZoneSchema })
  .refine((q) => !!q.imageUrl, { message: 'A pin question needs an image', path: ['imageUrl'] })
  .refine((q) => !q.imageEffect || q.imageEffect === 'none', {
    message: 'A pin question has no image effect',
    path: ['imageEffect'],
  });

const WhoOfUsQuestion = z.object({
  ...questionBase,
  type: z.literal('WHO_OF_US'),
  /** + WHO_OF_US_MAJORITY_BONUS for the players who voted for the most voted player(s). */
  majorityBonus: z.boolean().default(false),
});

const WordCloudQuestion = z.object({ ...questionBase, type: z.literal('WORD_CLOUD') });
/**
 * « Mytho ! » (Fibbage-like): `timeLimitSec` = time to write a lie (default 45 s), then
 * `voteTimeSec` to vote. Finding `truth` = `basePoints`; each player fooled by your lie =
 * `bluffFoolPoints` (+250 each, +500 at most). Points don't depend on the speed.
 */
const BluffQuestion = z.object({
  ...questionBase,
  type: z.literal('BLUFF'),
  timeLimitSec: questionBase.timeLimitSec.default(BLUFF_DEFAULT_WRITE_SEC),
  truth: z.string().trim().min(1).max(BLUFF_MAX_LENGTH),
  voteTimeSec: z.number().int().min(5).max(120).default(BLUFF_DEFAULT_VOTE_SEC),
});

/**
 * « Dessine-moi » (T30): the server picks one of `words` (or of the built-in `DRAW_WORDS` when
 * empty) and a drawer; the TV shows the live drawing instead of a picture (no `imageUrl`).
 * Guessers score the time-based points; the drawer `drawerShare` (basePoints × share of guessers who found it).
 */
const DrawQuestion = z
  .object({
    ...questionBase,
    type: z.literal('DRAW'),
    timeLimitSec: questionBase.timeLimitSec.default(DRAW_DEFAULT_SEC),
    words: z
      .array(z.string().trim().min(1).max(DRAW_WORD_MAX_LENGTH))
      .max(DRAW_MAX_WORDS)
      .default([]),
  })
  .refine((q) => !q.imageUrl, {
    message: 'A drawing question has no picture',
    path: ['imageUrl'],
  });

/**
 * « Liste chrono » (T57): `items` = the answers to find (each with its other spellings after
 * « | »), matched like typed answers; each player types as many as they can in `timeLimitSec`.
 */
const ListQuestion = z
  .object({
    ...questionBase,
    type: z.literal('LIST'),
    timeLimitSec: questionBase.timeLimitSec.default(LIST_DEFAULT_SEC),
    items: z
      .array(
        z
          .string()
          .trim()
          .max(LIST_ITEM_MAX_LENGTH)
          .refine((i) => listItemAnswers(i).length > 0, 'Empty item'),
      )
      .min(LIST_MIN_ITEMS)
      .max(LIST_MAX_ITEMS),
    typoTolerance: z.boolean().default(true),
  })
  .refine(
    (q) =>
      new Set(q.items.map((i) => listItemLabel(i).toLocaleLowerCase())).size === q.items.length,
    { message: 'Items must be different', path: ['items'] },
  );

/**
 * « Couleurs perdues » (T58): a generated board of `cells` shapes with random colors (drawn when
 * the question starts), or `imageUrl` + `zones` (each with the color it has on the picture).
 * `memoSec` to memorize, then `timeLimitSec` to put the colors back.
 */
const ColorsQuestion = z
  .object({
    ...questionBase,
    type: z.literal('COLORS'),
    timeLimitSec: questionBase.timeLimitSec.default(COLORS_DEFAULT_SEC),
    memoSec: z
      .number()
      .int()
      .min(COLORS_MIN_MEMO_SEC)
      .max(COLORS_MAX_MEMO_SEC)
      .default(COLORS_DEFAULT_MEMO_SEC),
    cells: z
      .number()
      .int()
      .min(COLORS_MIN_CELLS)
      .max(COLORS_MAX_CELLS)
      .default(COLORS_DEFAULT_CELLS),
    zones: z.array(ColorZoneSchema).max(COLORS_MAX_ZONES).default([]),
  })
  .refine((q) => q.zones.length === 0 || q.zones.length >= COLORS_MIN_ZONES, {
    message: 'At least 2 zones',
    path: ['zones'],
  })
  .refine((q) => q.zones.length === 0 || !!q.imageUrl, {
    message: 'Zones need an image',
    path: ['imageUrl'],
  })
  .refine((q) => !q.imageUrl || q.zones.length > 0, {
    message: 'Place the zones on the image',
    path: ['zones'],
  })
  .refine((q) => !q.imageEffect || q.imageEffect === 'none', {
    message: 'No image effect on this question',
    path: ['imageEffect'],
  });

/** « Qu'est-ce qui a disparu ? » (T59): time to memorize the picture « avant ». */
export const MISSING_MIN_MEMO_SEC = 5;
export const MISSING_MAX_MEMO_SEC = 60;
export const MISSING_DEFAULT_MEMO_SEC = 20;

/**
 * « Qu'est-ce qui a disparu ? » (T59): `imageUrl` = the picture « avant » (complete, shown on the
 * TV for `memoSec`), `missingImageUrl` = the same picture « après » with one element removed (TV
 * and phones for `timeLimitSec`), `zone` = where the element was (picture fractions, like PIN).
 */
const MissingQuestion = z
  .object({
    ...questionBase,
    type: z.literal('MISSING'),
    missingImageUrl: z.string().url(),
    memoSec: z
      .number()
      .int()
      .min(MISSING_MIN_MEMO_SEC)
      .max(MISSING_MAX_MEMO_SEC)
      .default(MISSING_DEFAULT_MEMO_SEC),
    zone: PinZoneSchema,
  })
  .refine((q) => !!q.imageUrl, { message: 'The picture « avant » is required', path: ['imageUrl'] })
  .refine((q) => q.missingImageUrl !== q.imageUrl, {
    message: 'The two pictures must be different',
    path: ['missingImageUrl'],
  })
  .refine((q) => !q.imageEffect || q.imageEffect === 'none', {
    message: 'No image effect on this question',
    path: ['imageEffect'],
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
      OrderQuestion,
      PinQuestion,
      WhoOfUsQuestion,
      WordCloudQuestion,
      BluffQuestion,
      DrawQuestion,
      ListQuestion,
      ColorsQuestion,
      MissingQuestion,
    ])
    .refine((q) => !q.imageEffect || q.imageEffect === 'none' || !!q.imageUrl, {
      message: 'An image effect needs an image',
      path: ['imageEffect'],
    })
    .refine((q) => !q.buzzer || buzzerAllowed(q.type), {
      message: 'This question type cannot be played with the buzzer',
      path: ['buzzer'],
    }),
);
export type Question = z.infer<typeof QuestionSchema>;
export type ChoiceQuestion = Extract<Question, { type: ChoiceQuestionType }>;
export type TypeAnswerQuestion = Extract<Question, { type: 'TYPE_ANSWER' }>;
export type SliderQuestion = Extract<Question, { type: 'SLIDER' }>;
export type OrderQuestion = Extract<Question, { type: 'ORDER' }>;
export type PinQuestion = Extract<Question, { type: 'PIN' }>;
export type WhoOfUsQuestion = Extract<Question, { type: 'WHO_OF_US' }>;
export type BluffQuestion = Extract<Question, { type: 'BLUFF' }>;
export type DrawQuestion = Extract<Question, { type: 'DRAW' }>;
export type ListQuestion = Extract<Question, { type: 'LIST' }>;
export type ColorsQuestion = Extract<Question, { type: 'COLORS' }>;
export type MissingQuestion = Extract<Question, { type: 'MISSING' }>;

export function isChoiceQuestion(q: Question): q is ChoiceQuestion {
  return (CHOICE_QUESTION_TYPES as readonly string[]).includes(q.type);
}

/** Choice texts (empty for the types without choices). */
export function choiceTexts(q: Question): string[] {
  return isChoiceQuestion(q) ? q.choices.map((c) => c.text) : [];
}

/** Indexes of the correct choices (empty for polls and the types without choices). */
export function correctChoiceIndexes(q: Question): number[] {
  if (q.type !== 'MCQ' && q.type !== 'TRUE_FALSE') return [];
  return q.choices.flatMap((c, i) => (c.isCorrect ? [i] : []));
}

/**
 * « Select all » (T37): an MCQ with 2 or more right choices (not played with the buzzer). The
 * phones toggle the shapes and validate; only the exact set of right choices is correct.
 */
export function isMultipleAnswer(q: Question): boolean {
  return q.type === 'MCQ' && !q.buzzer && q.choices.filter((c) => c.isCorrect).length >= 2;
}

/**
 * « Annuler ma réponse » (T43): every type but « Buzzer » questions (judged out loud), « Dessine-moi »
 * (guesses), « Mytho ! » (the lie can be changed while writing, the vote is final) and « Liste
 * chrono » (items found stay found).
 */
export function answerCancellable(type: QuestionType, buzzer?: boolean): boolean {
  return !buzzer && type !== 'DRAW' && type !== 'BLUFF' && type !== 'LIST';
}

/** The question's explanation, or undefined when it has none (empty / blank). */
export function questionExplanation(q: Question): string | undefined {
  return q.explanation?.trim() || undefined;
}

/**
 * The right answer in words, one line per accepted answer / item: what the host remote shows
 * secretly (`remote:answer`, T39) and what the host judges a « Buzzer » answer against.
 * `drawWord` = the word picked for a « Dessine-moi » (drawn when the question starts). Types
 * without a right answer (POLL, WHO_OF_US, WORD_CLOUD) → []. `boardColors`: the colors of a
 * generated « Couleurs perdues » board.
 */
export function answerText(q: Question, drawWord?: string, boardColors?: number[]): string[] {
  switch (q.type) {
    case 'MCQ':
    case 'TRUE_FALSE':
      return q.choices.filter((c) => c.isCorrect).map((c) => c.text);
    case 'TYPE_ANSWER':
      return [...q.acceptedAnswers];
    case 'SLIDER': {
      const { correct, margin, unit } = q.slider;
      const value = `${frenchNumber(correct)}${unit ? ` ${unit}` : ''}`;
      return [margin > 0 ? `${value} (± ${frenchNumber(margin)})` : value];
    }
    case 'ORDER':
      return q.items.map((item, i) => `${i + 1}. ${item}`);
    case 'PIN':
    case 'MISSING':
      return [
        `Zone : à ${percent(q.zone.x)} depuis la gauche, ${percent(q.zone.y)} depuis le haut`,
      ];
    case 'BLUFF':
      return [q.truth];
    case 'DRAW':
      return drawWord ? [drawWord] : [];
    case 'LIST':
      return q.items.map(listItemLabel);
    case 'COLORS':
      // `boardColors`: the colors of a generated board (drawn when the question starts).
      return (q.zones.length ? q.zones.map((z) => z.color) : (boardColors ?? [])).map(
        (c, i) => `${i + 1}. ${colorName(c)}`,
      );
    default:
      return [];
  }
}

/**
 * « Buzzer »: the right answer in words, for the host to judge what is said out loud (TV only,
 * and the phones at the reveal). Same as `answerText` (the buzzer types).
 */
export function buzzerAnswer(q: Question): string[] {
  return answerText(q);
}

const frenchNumber = (n: number) => String(n).replace('.', ',');
const percent = (fraction: number) => `${Math.round(fraction * 100)} %`;

/**
 * `PRIVATE`: only its owner can launch it. `PUBLIC`: listed in the library, any logged-in host
 * can launch or copy it (only the owner can edit it).
 */
export const QuizVisibility = z.enum(['PRIVATE', 'PUBLIC']);
export type QuizVisibility = z.infer<typeof QuizVisibility>;

/**
 * Look of the TV (and of the phones' waiting screens): colors, background, font, music and
 * confetti (T40). Never the answer colors / shapes. `classic` = the default purple look.
 */
export const QUIZ_THEMES = ['classic', 'halloween', 'christmas', 'retro', 'space'] as const;
export const QuizTheme = z.enum(QUIZ_THEMES);
export type QuizTheme = z.infer<typeof QuizTheme>;
export const DEFAULT_QUIZ_THEME: QuizTheme = 'classic';
export const QUIZ_THEME_NAMES: Record<QuizTheme, string> = {
  classic: 'Classique',
  halloween: 'Halloween',
  christmas: 'Noël',
  retro: 'Rétro',
  space: 'Espace',
};

export const QuizSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(95),
  description: z.string().max(500).optional(),
  coverImageUrl: z.string().url().optional(),
  /** Absent = `classic` (or unchanged on a quiz update). */
  theme: QuizTheme.optional(),
  questions: z.array(QuestionSchema).min(1).max(100),
});
export type Quiz = z.infer<typeof QuizSchema>;
