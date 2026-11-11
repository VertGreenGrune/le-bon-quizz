import {
  BLUFF_DEFAULT_VOTE_SEC,
  BLUFF_DEFAULT_WRITE_SEC,
  COLORS_DEFAULT_CELLS,
  COLORS_DEFAULT_MEMO_SEC,
  COLORS_DEFAULT_SEC,
  DRAW_DEFAULT_SEC,
  LIST_DEFAULT_SEC,
  POINTLESS_DEFAULT_SEC,
  WAGER_DEFAULT_BET_SEC,
  WAGER_DEFAULT_GUESS_SEC,
  MAX_ACCEPTED_ANSWERS,
  ORDER_MAX_ITEMS,
  ORDER_MIN_ITEMS,
  QuizInput,
  SHAPES,
  buzzerAllowed,
  hasRightAnswer,
  type Choice,
  type ColorZone,
  type ImageEffect,
  type PinZone,
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
  /** ORDER: 3–6 items, in the right order. */
  items: string[];
  /** PIN: correct zone on the picture (fractions of its size). */
  zone: PinZone;
  /** WHO_OF_US: points for the players who vote like the majority. */
  majorityBonus: boolean;
  /** BLUFF: the real answer, and the voting time (`timeLimitSec` = writing time). */
  truth: string;
  voteTimeSec: number;
  /** DRAW: words to draw, one picked at random (none = the built-in list). */
  words: string[];
  /**
   * LIST (« Liste chrono ») and POINTLESS (« Pas évident ! »): the items to find / accepted
   * answers, one per line (other spellings after « | »).
   */
  listItems: string[];
  /**
   * COLORS (« Couleurs perdues »): a generated board of `colorCells` shapes, or zones on the
   * picture (`colorZones`, each with its color); `memoSec` to memorize.
   */
  colorSource: 'generated' | 'picture';
  colorCells: number;
  colorZones: ColorZone[];
  memoSec: number;
  /**
   * MISSING (« Qu'est-ce qui a disparu ? »): the picture « après » (`imageUrl` = « avant »);
   * `zone` (shared with PIN) = where the element was, `memoSec` (shared with COLORS).
   */
  missingImageUrl?: string;
  /**
   * WAGER (« Paris sur les réponses »): the right number (NaN while the field is empty), its
   * unit, and the betting time (`timeLimitSec` = guessing time).
   */
  wagerCorrect: number;
  wagerUnit: string;
  betTimeSec: number;
  /** Sound clip (any type), played on the host screen. */
  audio?: QuestionAudio;
  audioOnReveal: boolean;
  /** Picture reveal effect; only sent with an image. */
  imageEffect: ImageEffect;
  /** « Buzzer » (T28); only sent for the types that take it (`buzzerAllowed`). */
  buzzer: boolean;
  /** « 💡 Le saviez-vous ? » (T37), any type; empty = none. */
  explanation: string;
}

/**
 * A `QuizInput` that may be invalid while being edited (empty texts, no correct answer…).
 * Validated with the shared `QuizInput` schema only on save. All helpers are pure.
 */
export type QuizDraft = Omit<QuizInput, 'questions'> & { questions: DraftQuestion[] };

export const MIN_CHOICES = 2;
/** One choice per answer shape (matches `QuestionSchema.choices.max`). */
export const MAX_CHOICES = SHAPES.length;
export { MAX_ACCEPTED_ANSWERS, ORDER_MAX_ITEMS, ORDER_MIN_ITEMS };
export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 180, 240] as const;
export const POINTS_OPTIONS = [
  { value: 1000, label: 'Standard (1000)' },
  { value: 2000, label: 'Double (2000)' },
  { value: 0, label: 'Aucun point' },
] as const;

/** The types of the editor's selector; `description` is shown on hover. */
export const QUESTION_TYPES: { type: QuestionType; label: string; description: string }[] = [
  {
    type: 'MCQ',
    label: 'Choix multiple',
    description:
      'Les joueurs choisissent parmi 2 à 4 réponses, dont une ou plusieurs bonnes. Plus ils répondent vite, plus ils marquent de points.',
  },
  {
    type: 'TRUE_FALSE',
    label: 'Vrai ou faux',
    description: 'Les joueurs doivent choisir entre les réponses « Vrai » et « Faux ».',
  },
  {
    type: 'TYPE_ANSWER',
    label: 'Réponse libre',
    description:
      'Les joueurs écrivent leur réponse sur leur téléphone. Les petites fautes d’orthographe peuvent être tolérées.',
  },
  {
    type: 'SLIDER',
    label: 'Curseur',
    description:
      'Les joueurs devinent un nombre avec un curseur. Une marge accepte les réponses proches : plus on est près, plus on marque.',
  },
  {
    type: 'POLL',
    label: 'Sondage',
    description:
      'Les joueurs votent pour la réponse de leur choix. Il n’y a pas de bonne réponse et aucun point n’est gagné.',
  },
  {
    type: 'ORDER',
    label: 'Ordre',
    description:
      'Les joueurs remettent 3 à 6 éléments dans le bon ordre. Chaque élément bien placé rapporte une partie des points.',
  },
  {
    type: 'PIN',
    label: 'Point sur l’image',
    description:
      'Les joueurs touchent l’image sur leur téléphone pour placer un point. Plus ils sont près de la zone à trouver, plus ils marquent.',
  },
  {
    type: 'WHO_OF_US',
    label: 'Qui de nous ?',
    description:
      'Les joueurs votent pour l’un d’entre eux. Pas de bonne réponse ; un bonus peut récompenser ceux qui votent comme la majorité.',
  },
  {
    type: 'WORD_CLOUD',
    label: 'Nuage de mots',
    description:
      'Chaque joueur écrit un mot ou deux : les réponses forment un nuage de mots à l’écran. Aucun point n’est gagné.',
  },
  {
    type: 'BLUFF',
    label: 'Mytho !',
    description:
      'Chaque joueur invente une fausse réponse crédible, puis tous votent pour celle qu’ils croient vraie. On marque en trouvant la vérité et en piégeant les autres.',
  },
  {
    type: 'DRAW',
    label: 'Dessine-moi',
    description:
      'Un joueur dessine un mot secret sur son téléphone, en direct à l’écran ; les autres le devinent en l’écrivant. Le dessinateur change à chaque question.',
  },
  {
    type: 'LIST',
    label: 'Liste chrono',
    description:
      'Les joueurs citent un maximum d’éléments d’une liste avant la fin du temps (« Citez les 7 nains »). Chaque élément trouvé rapporte une partie des points.',
  },
  {
    type: 'COLORS',
    label: 'Couleurs perdues',
    description:
      'Une image colorée s’affiche à l’écran, puis devient grise : les joueurs remettent les couleurs de mémoire avec une palette. Chaque zone juste rapporte une partie des points.',
  },
  {
    type: 'MISSING',
    label: 'Qu’est-ce qui a disparu ?',
    description:
      'Une image s’affiche à l’écran, puis la même image sans un élément : les joueurs touchent l’endroit où il était sur leur téléphone. Comme « Point sur l’image » : plus ils sont près, plus ils marquent.',
  },
  {
    type: 'POINTLESS',
    label: 'Pas évident !',
    description:
      'Chaque joueur donne une seule réponse (« Citez un pays d’Afrique ») : plus elle est rare parmi les joueurs, plus elle rapporte. Une bonne réponse que personne d’autre n’a donnée rapporte tous les points.',
  },
  {
    type: 'WAGER',
    label: 'Paris sur les réponses',
    description:
      'Chaque joueur estime un nombre, puis tous parient sur l’estimation la plus proche sans dépasser la bonne réponse. On marque en pariant juste et quand son estimation est la gagnante.',
  },
];

export const VOTE_TIMES = [10, 15, 20, 30, 45, 60] as const;

export const DEFAULT_PIN_ZONE: PinZone = { x: 0.5, y: 0.5, radius: 0.1 };

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
    items: Array.from({ length: ORDER_MIN_ITEMS }, () => ''),
    zone: DEFAULT_PIN_ZONE,
    majorityBonus: false,
    truth: '',
    voteTimeSec: BLUFF_DEFAULT_VOTE_SEC,
    words: [],
    listItems: ['', ''],
    colorSource: 'generated',
    colorCells: COLORS_DEFAULT_CELLS,
    colorZones: [],
    memoSec: COLORS_DEFAULT_MEMO_SEC,
    wagerCorrect: Number.NaN,
    wagerUnit: '',
    betTimeSec: WAGER_DEFAULT_BET_SEC,
    audioOnReveal: false,
    imageEffect: 'none',
    buzzer: false,
    explanation: '',
  };
}

export function emptyQuiz(): QuizDraft {
  return {
    title: '',
    description: '',
    visibility: 'PRIVATE',
    theme: 'classic',
    questions: [newQuestion()],
  };
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
  draft.buzzer = q.buzzer ?? false;
  draft.explanation = q.explanation ?? '';
  switch (q.type) {
    case 'TYPE_ANSWER':
      return { ...draft, acceptedAnswers: q.acceptedAnswers, typoTolerance: q.typoTolerance };
    case 'SLIDER':
      return { ...draft, slider: { ...q.slider, unit: q.slider.unit ?? '' } };
    case 'POLL':
      return { ...draft, choices: q.choices.map((c) => ({ text: c.text, isCorrect: false })) };
    case 'ORDER':
      return { ...draft, items: [...q.items] };
    case 'PIN':
      return { ...draft, zone: q.zone };
    case 'WHO_OF_US':
      return { ...draft, majorityBonus: q.majorityBonus };
    case 'WORD_CLOUD':
      return draft;
    case 'BLUFF':
      return { ...draft, truth: q.truth, voteTimeSec: q.voteTimeSec };
    case 'DRAW':
      return { ...draft, words: [...q.words] };
    case 'LIST':
    case 'POINTLESS':
      return { ...draft, listItems: [...q.items], typoTolerance: q.typoTolerance };
    case 'COLORS':
      return {
        ...draft,
        colorSource: q.zones.length ? 'picture' : 'generated',
        colorCells: q.cells,
        colorZones: q.zones.map((z) => ({ ...z })),
        memoSec: q.memoSec,
      };
    case 'MISSING':
      return { ...draft, missingImageUrl: q.missingImageUrl, zone: q.zone, memoSec: q.memoSec };
    case 'WAGER':
      return {
        ...draft,
        wagerCorrect: q.wager.correct,
        wagerUnit: q.wager.unit ?? '',
        betTimeSec: q.betTimeSec,
      };
    default:
      return { ...draft, choices: q.choices.map((c) => ({ ...c })) };
  }
}

export function fromDetail(quiz: QuizDetail): QuizDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, access: _a, ownerName: _o, ...input } = quiz;
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

/** Indexes of the ORDER items sent: empty ones are dropped while at least 3 remain. */
function keptItems(q: DraftQuestion): number[] {
  const kept = q.items.flatMap((item, i) => (item.trim() ? [i] : []));
  return kept.length >= ORDER_MIN_ITEMS ? kept : q.items.map((_, i) => i);
}

/** Indexes of the DRAW words sent: empty lines are dropped (none left = the built-in list). */
function keptWords(q: DraftQuestion): number[] {
  return q.words.flatMap((w, i) => (w.trim() ? [i] : []));
}

/** Indexes of the LIST items sent: empty lines are dropped. */
function keptListItems(q: DraftQuestion): number[] {
  return q.listItems.flatMap((item, i) => (item.trim() ? [i] : []));
}

type Kept = {
  choices: number[];
  acceptedAnswers: number[];
  items: number[];
  words: number[];
  listItems: number[];
};

/** The API body of one question: only the fields of its type. */
function questionBody(q: DraftQuestion, kept: Kept): unknown {
  const { choices, acceptedAnswers: answers } = kept;
  const base = {
    text: q.text,
    // « Dessine-moi »: the TV shows the drawing, a picture kept in the draft isn't sent.
    // « Couleurs perdues »: the picture only for a board on a picture.
    imageUrl:
      (q.type !== 'DRAW' && (q.type !== 'COLORS' || q.colorSource === 'picture') && q.imageUrl) ||
      undefined,
    type: q.type,
    timeLimitSec: q.timeLimitSec,
    basePoints: q.basePoints,
    audio: q.audio,
    audioOnReveal: q.audio && q.audioOnReveal ? true : undefined,
    // An effect without a picture (removed after choosing it) is dropped; PIN / DRAW have none.
    imageEffect:
      q.imageUrl &&
      q.imageEffect !== 'none' &&
      q.type !== 'PIN' &&
      q.type !== 'DRAW' &&
      q.type !== 'COLORS' &&
      q.type !== 'MISSING'
        ? q.imageEffect
        : undefined,
    // Kept in the draft when switching to a type without buzzer (and back), not saved there.
    buzzer: q.buzzer && buzzerAllowed(q.type) ? true : undefined,
    explanation: q.explanation.trim() || undefined,
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
    case 'ORDER':
      return { ...base, items: kept.items.map((i) => q.items[i]) };
    case 'PIN':
      return { ...base, zone: q.zone };
    case 'WHO_OF_US':
      return { ...base, majorityBonus: q.majorityBonus };
    case 'WORD_CLOUD':
      return base;
    case 'BLUFF':
      return { ...base, truth: q.truth, voteTimeSec: q.voteTimeSec };
    case 'DRAW':
      return { ...base, words: kept.words.map((i) => q.words[i]) };
    case 'LIST':
    case 'POINTLESS':
      return {
        ...base,
        items: kept.listItems.map((i) => q.listItems[i]),
        typoTolerance: q.typoTolerance,
      };
    case 'COLORS':
      return {
        ...base,
        memoSec: q.memoSec,
        cells: q.colorCells,
        zones: q.colorSource === 'picture' ? q.colorZones : [],
      };
    case 'MISSING':
      return {
        ...base,
        missingImageUrl: q.missingImageUrl || undefined,
        memoSec: q.memoSec,
        zone: q.zone,
      };
    case 'WAGER':
      return {
        ...base,
        wager: { correct: q.wagerCorrect, unit: q.wagerUnit.trim() || undefined },
        betTimeSec: q.betTimeSec,
      };
    default:
      return { ...base, choices: choices.map((i) => q.choices[i]) };
  }
}

/**
 * Body sent to the API: drops empty optional strings, empty extra choices / accepted answers /
 * items and the fields of the other types, then validates with `QuizInput`. Error paths always
 * refer to the draft's own choice / answer / item indexes.
 */
export function validateDraft(draft: QuizDraft): Validation<QuizInput> {
  const description = draft.description?.trim();
  const kept: Kept[] = draft.questions.map((q) => ({
    choices: keptChoices(q),
    acceptedAnswers: keptAnswers(q),
    items: keptItems(q),
    words: keptWords(q),
    listItems: keptListItems(q),
  }));
  const result = validate(QuizInput, {
    ...draft,
    description: description ? description : undefined,
    questions: draft.questions.map((q, qi) => questionBody(q, kept[qi]!)),
  });
  if (result.ok) return result;
  const errors: FieldErrors = {};
  for (const [rawKey, message] of Object.entries(result.errors)) {
    // LIST items are `items` in the API, `listItems` in the draft (ORDER keeps `items`).
    const listItem = /^questions\.(\d+)\.items/.exec(rawKey);
    const key =
      listItem && ['LIST', 'POINTLESS'].includes(draft.questions[Number(listItem[1])]?.type ?? '')
        ? rawKey.replace('.items', '.listItems')
        : rawKey;
    const m = /^questions\.(\d+)\.(choices|acceptedAnswers|items|words|listItems)\.(\d+)(.*)$/.exec(
      key,
    );
    const list = m ? kept[Number(m[1])]?.[m[2] as keyof Kept] : undefined;
    const original = m ? `questions.${m[1]}.${m[2]}.${list?.[Number(m[3])] ?? m[3]}${m[4]}` : key;
    errors[original] = message;
  }
  return { ok: false, errors };
}

/** The quiz shares uploaded pictures or sounds (copyright warning when it is made public). */
export function hasMedia(draft: QuizDraft): boolean {
  return (
    !!draft.coverImageUrl ||
    draft.questions.some(
      (q) =>
        (q.imageUrl && q.type !== 'DRAW') || (q.missingImageUrl && q.type === 'MISSING') || q.audio,
    )
  );
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
    items: [...q.items],
    words: [...q.words],
    listItems: [...q.listItems],
    colorZones: q.colorZones.map((z) => ({ ...z })),
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
 * a type without a right answer (poll, « Qui de nous ? », word cloud) gives no points. The fields
 * of the other types are kept for a switch back.
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
  if (!hasRightAnswer(type)) return { ...q, type, basePoints: 0 };
  // « Mytho ! »: writing a good lie takes time (the default 20 s becomes 45 s).
  if (type === 'BLUFF' && q.timeLimitSec === 20)
    q = { ...q, timeLimitSec: BLUFF_DEFAULT_WRITE_SEC };
  // « Dessine-moi »: drawing takes time too.
  if (type === 'DRAW' && q.timeLimitSec === 20) q = { ...q, timeLimitSec: DRAW_DEFAULT_SEC };
  // « Liste chrono »: time to type many answers.
  if (type === 'LIST' && q.timeLimitSec === 20) q = { ...q, timeLimitSec: LIST_DEFAULT_SEC };
  // « Pas évident ! »: time to think of a rare answer.
  if (type === 'POINTLESS' && q.timeLimitSec === 20)
    q = { ...q, timeLimitSec: POINTLESS_DEFAULT_SEC };
  // « Couleurs perdues »: time to put every color back.
  if (type === 'COLORS' && q.timeLimitSec === 20) q = { ...q, timeLimitSec: COLORS_DEFAULT_SEC };
  // « Paris sur les réponses »: time to think of a number.
  if (type === 'WAGER' && q.timeLimitSec === 20)
    q = { ...q, timeLimitSec: WAGER_DEFAULT_GUESS_SEC };
  // Leaving a type without a right answer: back to the standard points.
  const noPoints = !hasRightAnswer(q.type) && q.basePoints === 0;
  return { ...q, type, basePoints: noPoints ? 1000 : q.basePoints };
}

// ---------- « Couleurs perdues » ----------

/** Editor: a new zone where the picture was clicked (the color picked last, or red). */
export function addColorZone(q: DraftQuestion, x: number, y: number): DraftQuestion {
  const color = q.colorZones.at(-1)?.color ?? 0;
  const radius = q.colorZones.at(-1)?.radius ?? 0.06;
  return { ...q, colorZones: [...q.colorZones, { x, y, radius, color }] };
}

export function updateColorZone(
  q: DraftQuestion,
  index: number,
  patch: Partial<ColorZone>,
): DraftQuestion {
  const z = q.colorZones[index];
  if (!z) return q;
  return { ...q, colorZones: replaceAt(q.colorZones, index, { ...z, ...patch }) };
}

export function removeColorZone(q: DraftQuestion, index: number): DraftQuestion {
  return { ...q, colorZones: q.colorZones.filter((_, i) => i !== index) };
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

// ---------- Order ----------

export function updateItem(q: DraftQuestion, index: number, text: string): DraftQuestion {
  return { ...q, items: replaceAt(q.items, index, text) };
}

export function addItem(q: DraftQuestion): DraftQuestion {
  if (q.items.length >= ORDER_MAX_ITEMS) return q;
  return { ...q, items: [...q.items, ''] };
}

export function removeItem(q: DraftQuestion, index: number): DraftQuestion {
  if (q.items.length <= ORDER_MIN_ITEMS) return q;
  return { ...q, items: q.items.filter((_, i) => i !== index) };
}

export function moveItem(q: DraftQuestion, from: number, to: number): DraftQuestion {
  if (to < 0 || to >= q.items.length || from === to) return q;
  const items = [...q.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item!);
  return { ...q, items };
}

/**
 * « Select all » (T37): an MCQ with 2+ right answers, not played with the buzzer — the players
 * must tick them all to score (the editor shows a hint).
 */
export function isMultipleAnswerDraft(q: DraftQuestion): boolean {
  return q.type === 'MCQ' && !q.buzzer && q.choices.filter((c) => c.isCorrect).length >= 2;
}
