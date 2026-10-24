import { z } from 'zod';

/**
 * « Dessine-moi » (T30): the drawing surface and its vector messages. A drawing is a list of
 * strokes; points are integers in a DRAW_WIDTH × DRAW_HEIGHT space (4:3), so the messages stay
 * small and every screen renders the same picture at its own size.
 */
export const DRAW_WIDTH = 1000;
export const DRAW_HEIGHT = 750;

/** Pen colors (index = `DrawStroke.color`): noir, rouge, orange, jaune, vert, bleu, violet, marron. */
export const DRAW_COLORS = [
  '#111827',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#92400e',
] as const;
export const DRAW_COLOR_NAMES = [
  'Noir',
  'Rouge',
  'Orange',
  'Jaune',
  'Vert',
  'Bleu',
  'Violet',
  'Marron',
] as const;
/** Pen widths (index = `DrawStroke.size`), in drawing units. */
export const DRAW_SIZES = [6, 14, 30] as const;
/** The eraser paints with the background color, this wide. */
export const DRAW_ERASER_SIZE = 44;
export const DRAW_BACKGROUND = '#ffffff';

/** Whole drawing limits (a server refuses more). */
export const DRAW_MAX_STROKES = 1000;
export const DRAW_MAX_POINTS = 20_000;
/** One message: at most this many stroke chunks, each with at most this many points. */
export const DRAW_MAX_CHUNKS = 20;
export const DRAW_CHUNK_MAX_POINTS = 200;
/** The drawer's phone sends its new points this often (throttle). */
export const DRAW_FLUSH_MS = 60;

const coordinate = z.number().int().min(0).max(Math.max(DRAW_WIDTH, DRAW_HEIGHT));

/**
 * One stroke, or (in `player:draw` / `draw:strokes`) a chunk of it: the points of a chunk whose
 * `id` is already known are appended to that stroke. `points` = flat [x0, y0, x1, y1, …].
 */
export const DrawStrokeSchema = z.object({
  id: z
    .number()
    .int()
    .min(0)
    .max(DRAW_MAX_STROKES * 10),
  color: z
    .number()
    .int()
    .min(0)
    .max(DRAW_COLORS.length - 1),
  size: z
    .number()
    .int()
    .min(0)
    .max(DRAW_SIZES.length - 1),
  /** Eraser: painted with the background color, DRAW_ERASER_SIZE wide. */
  erase: z.literal(true).optional(),
  points: z
    .array(coordinate)
    .max(DRAW_CHUNK_MAX_POINTS * 2)
    .refine((p) => p.length % 2 === 0, { message: 'Points come in (x, y) pairs' }),
});
export type DrawStroke = z.infer<typeof DrawStrokeSchema>;

/** Rendering of a stroke: its color and width in drawing units. */
export function strokeStyle(s: Pick<DrawStroke, 'color' | 'size' | 'erase'>): {
  color: string;
  width: number;
} {
  if (s.erase) return { color: DRAW_BACKGROUND, width: DRAW_ERASER_SIZE };
  return { color: DRAW_COLORS[s.color] ?? DRAW_COLORS[0], width: DRAW_SIZES[s.size] ?? 14 };
}

/** Appends chunks to a drawing (new ids become new strokes); returns a new array. */
export function mergeStrokes(drawing: readonly DrawStroke[], chunks: readonly DrawStroke[]) {
  const strokes = [...drawing];
  for (const chunk of chunks) {
    const i = strokes.findIndex((s) => s.id === chunk.id);
    if (i < 0) strokes.push({ ...chunk, points: [...chunk.points] });
    else strokes[i] = { ...strokes[i]!, points: [...strokes[i]!.points, ...chunk.points] };
  }
  return strokes;
}

/**
 * What the TV shows of the word to find: one `_` per letter or digit, spaces / hyphens /
 * apostrophes kept (« tour Eiffel » → « ____ ______ »).
 */
export function wordHint(word: string): string {
  return word.replace(/[\p{L}\p{N}]/gu, '_');
}

/** Built-in French word list, used when the question gives no word: things easy to draw. */
export const DRAW_WORDS = [
  'chat',
  'chien',
  'maison',
  'voiture',
  'vélo',
  'arbre',
  'fleur',
  'soleil',
  'lune',
  'étoile',
  'nuage',
  'pluie',
  'parapluie',
  'bateau',
  'avion',
  'fusée',
  'train',
  'poisson',
  'oiseau',
  'serpent',
  'escargot',
  'papillon',
  'araignée',
  'girafe',
  'éléphant',
  'lapin',
  'cochon',
  'vache',
  'mouton',
  'cheval',
  'lion',
  'singe',
  'pingouin',
  'tortue',
  'crocodile',
  'requin',
  'baleine',
  'pieuvre',
  'dinosaure',
  'dragon',
  'fantôme',
  'robot',
  'sorcière',
  'pirate',
  'château',
  'couronne',
  'épée',
  'trésor',
  'clé',
  'cadenas',
  'lunettes',
  'chapeau',
  'chaussure',
  'chaussette',
  'tee-shirt',
  'pantalon',
  'montre',
  'téléphone',
  'ordinateur',
  'télévision',
  'guitare',
  'piano',
  'tambour',
  'trompette',
  'micro',
  'ballon',
  'raquette',
  'trophée',
  'médaille',
  'piscine',
  'plage',
  'montagne',
  'volcan',
  'île',
  'désert',
  'cactus',
  'palmier',
  'sapin',
  'champignon',
  'pomme',
  'banane',
  'cerise',
  'fraise',
  'ananas',
  'carotte',
  'tomate',
  'pizza',
  'gâteau',
  'glace',
  'croissant',
  'baguette',
  'fromage',
  'œuf',
  'sandwich',
  'frites',
  'bonbon',
  'café',
  'bougie',
  'cadeau',
  'ballon de foot',
  'bonhomme de neige',
  'arc-en-ciel',
  'tour Eiffel',
  'pyramide',
  'phare',
  'pont',
  'feu rouge',
  'échelle',
  'marteau',
  'ciseaux',
  'crayon',
  'livre',
  'lettre',
  'enveloppe',
  'horloge',
  'réveil',
  'lit',
  'chaise',
  'table',
  'lampe',
  'fenêtre',
  'porte',
  'escalier',
  'baignoire',
  'brosse à dents',
  'savon',
  'miroir',
  'ampoule',
  'aimant',
  'loupe',
  'boussole',
  'carte',
  'tente',
  'feu de camp',
  'canne à pêche',
  'ancre',
  'sous-marin',
  'hélicoptère',
  'tracteur',
  'camion',
  'moto',
  'trottinette',
  'skateboard',
  'cerf-volant',
  'toboggan',
  'balançoire',
  'cœur',
  'squelette',
  'vampire',
  'licorne',
  'sirène',
  'extraterrestre',
  'astronaute',
  'clown',
  'roi',
  'chevalier',
] as const;
