import { z } from 'zod';

/**
 * « Survie » mode (PLAN.md §3 "Survie"): everyone starts with `hearts` ❤️ (host option, 1–5); a
 * wrong or missing answer costs one, at 0 the player becomes a 👻 fantôme who keeps answering
 * and haunts the living. The last survivor wins.
 */
export const SURVIVAL_MIN_HEARTS = 1;
export const SURVIVAL_MAX_HEARTS = 5;
export const SURVIVAL_DEFAULT_HEARTS = 3;

export const SurvivalHearts = z.number().int().min(SURVIVAL_MIN_HEARTS).max(SURVIVAL_MAX_HEARTS);

/** What a ghost can do to a living player after a correct answer: a free Gel or Brouilleur. */
export const HauntType = z.enum(['freeze', 'scramble']);
export type HauntType = z.infer<typeof HauntType>;

export const HAUNTS: Record<HauntType, { name: string; icon: string; description: string }> = {
  freeze: {
    name: 'Gel',
    icon: '🥶',
    description: 'Ses boutons sont bloqués 5 s au début de sa prochaine question.',
  },
  scramble: {
    name: 'Brouilleur',
    icon: '🌀',
    description: 'Ses boutons sont gris et mélangés à sa prochaine question à choix.',
  },
};
