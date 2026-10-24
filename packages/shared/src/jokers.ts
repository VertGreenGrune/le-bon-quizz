import { z } from 'zod';
import type { QuestionType } from './quiz.js';

/**
 * Jokers (power-ups, PLAN.md §3 "Jokers"): host option of `host:create`. Each player gets
 * JOKERS_AT_START random jokers, + 1 every JOKER_STREAK_STEP correct answers in a row (at most
 * JOKERS_MAX in hand); one joker per question, during QUESTION_INTRO / ANSWERING before answering.
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
  /** Aimed at another player: blocked by a Bouclier, one per target per question. */
  attack: boolean;
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
  },
  copy: {
    id: 'copy',
    name: 'Copieur',
    icon: '🦜',
    description: 'Donne automatiquement la réponse du joueur choisi (son temps + 1 s).',
    target: true,
    attack: false,
  },
  freeze: {
    id: 'freeze',
    name: 'Gel',
    icon: '🥶',
    description: 'Bloque les boutons du joueur choisi 5 s au début de sa prochaine question.',
    target: true,
    attack: true,
  },
  scramble: {
    id: 'scramble',
    name: 'Brouilleur',
    icon: '🌀',
    description: 'Mélange et grise les boutons du joueur choisi à sa prochaine question à choix.',
    target: true,
    attack: true,
  },
  double: {
    id: 'double',
    name: 'Double ou rien',
    icon: '✖️2',
    description: 'Bonne réponse : points ×2. Mauvaise : −500 points.',
    target: false,
    attack: false,
  },
  shield: {
    id: 'shield',
    name: 'Bouclier',
    icon: '🛡️',
    description: 'Bloque la prochaine attaque contre toi et garde ta série si tu te trompes.',
    target: false,
    attack: false,
  },
  thief: {
    id: 'thief',
    name: 'Voleur',
    icon: '🦹',
    description: 'Si tu réponds juste, tu voles 10 % du score du joueur choisi.',
    target: true,
    attack: true,
  },
  hourglass: {
    id: 'hourglass',
    name: 'Sablier',
    icon: '⏳',
    description: 'Tes points de rapidité comptent comme si tu avais répondu deux fois plus vite.',
    target: false,
    attack: false,
  },
};

export const JOKER_TYPES = JokerType.options;
export const JOKERS_AT_START = 3;
export const JOKERS_MAX = 5;
/** One more joker every this many correct answers in a row (3, 6, 9…). */
export const JOKER_STREAK_STEP = 3;
/** Gel: the target's answers are refused this long after its ANSWERING starts. */
export const FREEZE_MS = 5000;
/** Double ou rien: points lost on a wrong / missing answer (the score never goes below 0). */
export const DOUBLE_PENALTY = 500;
/** Voleur: share of the target's score stolen on a right answer. */
export const THIEF_SHARE = 0.1;
/** Copieur: the copied answer counts this much slower than the original. */
export const COPY_DELAY_MS = 1000;

export interface JokerAvailability {
  /** The question takes jokers (no right answer, e.g. a poll → jokers not offered / refused). */
  jokers: boolean;
  /** Jokers that can't be played on this type (greyed out on the phone). */
  unavailable: JokerType[];
  /** A pending Brouilleur hits on this type (otherwise it waits for the next one that does). */
  scramble: boolean;
}

/**
 * THE per-question-type joker table (Wave 6 coordination: a new question type is wired here with
 * one line). Gel hits on every type that takes jokers.
 */
const AVAILABILITY: Record<QuestionType, JokerAvailability> = {
  MCQ: { jokers: true, unavailable: [], scramble: true },
  TRUE_FALSE: { jokers: true, unavailable: ['fifty'], scramble: true },
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
};

const NO_JOKERS: JokerAvailability = { jokers: false, unavailable: [], scramble: false };

export function jokerAvailability(type: QuestionType): JokerAvailability {
  return AVAILABILITY[type] ?? NO_JOKERS;
}

/** Can this joker be played on a question of this type? */
export function jokerAllowed(type: QuestionType, joker: JokerType): boolean {
  const a = jokerAvailability(type);
  return a.jokers && !a.unavailable.includes(joker);
}
