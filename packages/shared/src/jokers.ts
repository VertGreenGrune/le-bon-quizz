import { z } from 'zod';
import type { QuestionType } from './quiz.js';

/**
 * Jokers (power-ups, PLAN.md §3 "Jokers"): host option of `host:create`. Each player gets
 * JOKERS_AT_START random jokers, + 1 every JOKER_STREAK_STEP correct answers in a row (at most
 * JOKERS_MAX in hand); one joker per question, during QUESTION_INTRO / ANSWERING — after answering
 * too for the jokers marked `afterAnswer` (T42).
 */
export const JokerType = z.enum([
  'fifty',
  'copy',
  'freeze',
  'scramble',
  'double',
  'shield',
  'thief',
  'hourglass',
]);
export type JokerType = z.infer<typeof JokerType>;

export interface JokerInfo {
  id: JokerType;
  name: string;
  icon: string;
  /** One line shown on the phone before playing it. */
  description: string;
  /** Needs a target player. */
  target: boolean;
  /**
   * Aimed at another player: blocked by a Bouclier, one per target per question. Gel /
   * Brouilleur hit the current question, on a target who hasn't answered yet.
   */
  attack: boolean;
  /** Can still be played after answering, while the others answer (T42). */
  afterAnswer: boolean;
}

export const JOKERS: Record<JokerType, JokerInfo> = {
  fifty: {
    id: 'fifty',
    name: '50/50',
    icon: '🎯',
    description:
      'Cache la moitié des mauvaises réponses (curseur : plage réduite ; réponse libre : première lettre).',
    target: false,
    attack: false,
    afterAnswer: false,
  },
  copy: {
    id: 'copy',
    name: 'Copieur',
    icon: '🦜',
    description: 'Donne automatiquement la réponse du joueur choisi (son temps + 1 s).',
    target: true,
    attack: false,
    afterAnswer: false,
  },
  freeze: {
    id: 'freeze',
    name: 'Gel',
    icon: '🥶',
    description:
      'Bloque les réponses du joueur choisi pendant 5 s sur cette question (s’il n’a pas encore répondu).',
    target: true,
    attack: true,
    afterAnswer: true,
  },
  scramble: {
    id: 'scramble',
    name: 'Brouilleur',
    icon: '🌀',
    description:
      'Fait bouger les boutons du joueur choisi dans tout l’écran : dur de viser la bonne réponse ! (choix multiple, s’il n’a pas encore répondu)',
    target: true,
    attack: true,
    afterAnswer: true,
  },
  double: {
    id: 'double',
    name: 'Double ou rien',
    icon: '✖️2',
    description: 'Bonne réponse : points ×2. Mauvaise : −500 points.',
    target: false,
    attack: false,
    afterAnswer: true,
  },
  shield: {
    id: 'shield',
    name: 'Bouclier',
    icon: '🛡️',
    description: 'Bloque la prochaine attaque contre toi et garde ta série si tu te trompes.',
    target: false,
    attack: false,
    afterAnswer: true,
  },
  thief: {
    id: 'thief',
    name: 'Voleur',
    icon: '🦹',
    description:
      'À la réponse, une roue désigne un joueur au hasard : tu lui voles 10 % de ses points. Si elle tombe sur toi, c’est toi qui perds 10 % !',
    target: false,
    attack: false,
    afterAnswer: true,
  },
  hourglass: {
    id: 'hourglass',
    name: 'Sablier',
    icon: '⏳',
    description: 'Tes points de rapidité comptent comme si tu avais répondu deux fois plus vite.',
    target: false,
    attack: false,
    afterAnswer: true,
  },
};

export const JOKER_TYPES = JokerType.options;
export const JOKERS_AT_START = 3;
export const JOKERS_MAX = 5;
/** One more joker every this many correct answers in a row (3, 6, 9…). */
export const JOKER_STREAK_STEP = 3;
/** Gel: the target's answers are refused this long (from ANSWERING's start, or from when it lands). */
export const FREEZE_MS = 5000;
/** Double ou rien: points lost on a wrong / missing answer (the score never goes below 0). */
export const DOUBLE_PENALTY = 500;
/** Voleur (T51): share of the drawn player's score moved by the wheel. */
export const THIEF_SHARE = 0.1;
/** Copieur: the copied answer counts this much slower than the original. */
export const COPY_DELAY_MS = 1000;

export interface JokerAvailability {
  /** The question takes jokers (no right answer, e.g. a poll → jokers not offered / refused). */
  jokers: boolean;
  /** Jokers that can't be played on this type (greyed out on the phone). */
  unavailable: JokerType[];
  /**
   * Brouilleur works on this type: MCQ only, single or « select all » (its shape buttons move
   * all over the phone screen). A « Survie » haunt Brouilleur waits for the next question that
   * has it; the Brouilleur joker is refused elsewhere (T42).
   */
  scramble: boolean;
  /** A pending Gel hits here although the question takes no joker (« Buzzer »: BUZZ delayed). */
  freeze?: true;
  /** Jokers that can still be played after answering on this type (`JOKERS[j].afterAnswer`). */
  afterAnswer: JokerType[];
}

/**
 * THE per-question-type joker table (Wave 6 coordination: a new question type is wired here with
 * one line). Gel hits on every type that takes jokers.
 */
const AVAILABILITY: Record<QuestionType, Omit<JokerAvailability, 'afterAnswer'>> = {
  MCQ: { jokers: true, unavailable: [], scramble: true },
  // No Brouilleur: two big buttons moving around are still too easy to hit.
  TRUE_FALSE: { jokers: true, unavailable: ['fifty'], scramble: false },
  TYPE_ANSWER: { jokers: true, unavailable: [], scramble: false },
  SLIDER: { jokers: true, unavailable: [], scramble: false },
  POLL: { jokers: false, unavailable: [], scramble: false },
  // T27 types: no 50/50 on ordre / point (no wrong choices to hide); no right answer → like POLL.
  ORDER: { jokers: true, unavailable: ['fifty'], scramble: false },
  PIN: { jokers: true, unavailable: ['fifty'], scramble: false },
  WHO_OF_US: { jokers: false, unavailable: [], scramble: false },
  WORD_CLOUD: { jokers: false, unavailable: [], scramble: false },
  // « Mytho ! » (T26): Copieur copies the vote, 50/50 hides half of the lies; points don't
  // depend on the speed (no Sablier); no buttons to scramble.
  BLUFF: { jokers: true, unavailable: ['scramble', 'hourglass'], scramble: false },
  // « Dessine-moi » (T30): no joker (one player draws, the others guess); a pending attack waits.
  DRAW: { jokers: false, unavailable: [], scramble: false },
  // « Liste chrono » (T57): no joker (many answers per player); a pending attack waits.
  LIST: { jokers: false, unavailable: [], scramble: false },
  // « Couleurs perdues » (T58): 50/50 colors half of the zones; no buttons to scramble, nothing
  // to copy (everyone saw the same board).
  COLORS: { jokers: true, unavailable: ['scramble', 'copy'], scramble: false },
  // « Qu'est-ce qui a disparu ? » (T59): like PIN (a point on a picture).
  MISSING: { jokers: true, unavailable: ['fifty'], scramble: false },
  // « Pas évident ! » (T60): 50/50 = first letter of an item; points don't depend on the speed
  // (no Sablier); no buttons to scramble.
  POINTLESS: { jokers: true, unavailable: ['scramble', 'hourglass'], scramble: false },
  // « Paris sur les réponses » (T61): Copieur copies the bet, Gel blocks the start of the bets;
  // nothing to hide nor scramble, no time points (no Sablier).
  WAGER: { jokers: true, unavailable: ['fifty', 'scramble', 'hourglass'], scramble: false },
  // « Sur la même longueur d'onde » (T62): no joker (one player gives a clue, like DRAW).
  WAVELENGTH: { jokers: false, unavailable: [], scramble: false },
};

const NO_JOKERS: JokerAvailability = {
  jokers: false,
  unavailable: [],
  scramble: false,
  afterAnswer: [],
};

/** « Buzzer » questions (T28), whatever their type: no joker, but a pending Gel delays the BUZZ. */
const BUZZER: JokerAvailability = { ...NO_JOKERS, freeze: true };

export function jokerAvailability(type: QuestionType, buzzer = false): JokerAvailability {
  if (buzzer) return BUZZER;
  const a = AVAILABILITY[type];
  if (!a?.jokers) return a ? { ...a, afterAnswer: [] } : NO_JOKERS;
  return {
    ...a,
    afterAnswer: JOKER_TYPES.filter(
      (j) =>
        JOKERS[j].afterAnswer && !a.unavailable.includes(j) && (j !== 'scramble' || a.scramble),
    ),
  };
}

/**
 * Why this joker can't be played on a question of this type (`buzzer`: a « Buzzer » question;
 * `answered`: the player already answered it), or null when it can. Same text on the server
 * (`JOKER_REFUSED`) and on the phone (greyed joker).
 */
export function jokerRefusal(
  type: QuestionType,
  joker: JokerType,
  { buzzer = false, answered = false }: { buzzer?: boolean; answered?: boolean } = {},
): string | null {
  if (buzzer) return 'Pas de joker sur une question au buzzer';
  const a = jokerAvailability(type);
  if (!a.jokers) return 'Pas de joker sur cette question';
  if (joker === 'scramble' && !a.scramble)
    return 'Le Brouilleur ne marche que sur les questions à choix multiple';
  if (a.unavailable.includes(joker)) return 'Ce joker ne marche pas sur cette question';
  if (answered && !a.afterAnswer.includes(joker)) return 'Seulement avant de répondre';
  return null;
}

/** Can this joker be played on a question of this type (`buzzer`: a « Buzzer » question)? */
export function jokerAllowed(
  type: QuestionType,
  joker: JokerType,
  buzzer = false,
  answered = false,
): boolean {
  return jokerRefusal(type, joker, { buzzer, answered }) === null;
}
