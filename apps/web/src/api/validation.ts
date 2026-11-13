/**
 * Form validation with the shared zod schemas, with French messages per field.
 * Typed structurally so the web app doesn't need its own `zod` dependency.
 */

export interface Issue {
  code: string;
  path: PropertyKey[];
  message: string;
  origin?: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

interface SafeParser<T> {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: Issue[] } };
}

/** Field path (`questions.0.choices.1.text`) → first error message for that field. */
export type FieldErrors = Record<string, string>;

export type Validation<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

// Messages of `.refine()` checks in packages/shared.
const customMessages: Record<string, string> = {
  'At least one choice must be correct': 'Coche au moins une bonne réponse',
  // « Associer » (T67).
  'A text or a picture is needed': 'Il faut un texte ou une image de chaque côté',
  'Each item must be different': 'Chaque élément doit être différent',
  'This question cannot take bids': 'Pas d’enchères sur ce type de question',
  'True/false questions have exactly 2 choices': 'Une question vrai/faux a exactement 2 réponses',
  'Min must be below max': 'Le maximum doit être supérieur au minimum',
  'Too many steps': 'Pas trop petit pour cet intervalle',
  'Correct value out of range': 'La bonne réponse doit être entre le minimum et le maximum',
  'Correct value not on a step': 'La bonne réponse doit tomber sur un cran du curseur',
  'An image effect needs an image': 'Ajoute une image pour utiliser un effet',
  'Items must be different': 'Les éléments doivent être tous différents',
  'A pin question needs an image': 'Ajoute une image : les joueurs vont la toucher',
  'A pin question has no image effect': 'Pas d’effet sur l’image pour cette question',
  'At least 2 zones': 'Place au moins 2 zones',
  'Zones need an image': 'Ajoute une image pour placer les zones',
  'Place the zones on the image': 'Touche l’image pour placer les zones',
  'Paint-bucket zones need a blank picture':
    'L’image aux zones blanches se prépare… réessaie dans un instant',
};

export function issueMessage(issue: Issue): string {
  const n = (v: number | bigint | undefined) => Number(v);
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') {
        return n(issue.minimum) <= 1
          ? 'Champ obligatoire'
          : `Au moins ${n(issue.minimum)} caractères`;
      }
      if (issue.origin === 'array') return `Au moins ${n(issue.minimum)} élément(s)`;
      return `Minimum ${n(issue.minimum)}`;
    case 'too_big':
      if (issue.origin === 'string') return `${n(issue.maximum)} caractères maximum`;
      if (issue.origin === 'array') return `${n(issue.maximum)} élément(s) maximum`;
      return `Maximum ${n(issue.maximum)}`;
    case 'invalid_format':
      return issue.format === 'email' ? 'Adresse e-mail invalide' : 'Format invalide';
    case 'custom':
      return customMessages[issue.message] ?? issue.message;
    default:
      return 'Valeur invalide';
  }
}

export function validate<T>(schema: SafeParser<T>, data: unknown): Validation<T> {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.');
    errors[key] ??= issueMessage(issue);
  }
  return { ok: false, errors };
}
