import {
  WAVELENGTH_BANDS,
  WAVELENGTH_SCALE,
  type WavelengthReveal,
  type WavelengthSpectrum,
} from '@lbq/shared';

/**
 * « Sur la même longueur d'onde » (T62): pure helpers for the scale drawn on the TV, the phones,
 * the editor and the report.
 */

/** A scoring band around the target, in % of the scale (clamped to 0–100), widest first. */
export interface Band {
  from: number;
  to: number;
  share: number;
}

/** The bands (± 20 / 12 / 5) around the target, widest first (drawn in that order). */
export function bandsFor(target: number): Band[] {
  return [...WAVELENGTH_BANDS].reverse().map((b) => ({
    from: Math.max(0, target - b.distance),
    to: Math.min(WAVELENGTH_SCALE, target + b.distance),
    share: b.share,
  }));
}

/** Editor: « Froid / Chaud » → `{ left, right }` (the first « / » splits; trimmed). */
export function parseSpectrumLine(line: string): WavelengthSpectrum {
  const i = line.indexOf('/');
  if (i < 0) return { left: line.trim(), right: '' };
  return { left: line.slice(0, i).trim(), right: line.slice(i + 1).trim() };
}

/** Editor: `{ left, right }` → « Froid / Chaud ». */
export function spectrumLine(s: WavelengthSpectrum): string {
  return `${s.left} / ${s.right}`;
}

/** Ids of the closest needles (ties included); none without a needle. */
export function closestNeedles(reveal: Pick<WavelengthReveal, 'needles' | 'target'>): string[] {
  if (reveal.needles.length === 0) return [];
  const best = Math.min(...reveal.needles.map((n) => Math.abs(n.value - reveal.target)));
  return reveal.needles.filter((n) => Math.abs(n.value - reveal.target) === best).map((n) => n.id);
}

/** The phone's result title. */
export function wavelengthResultTitle(r: {
  correct: boolean;
  pointsEarned: number;
  wavelength?: { psychic: boolean; clue: string | null; yours?: number; target: number };
}): string {
  const w = r.wavelength;
  if (!w) return r.correct ? 'Correct !' : 'Raté !';
  if (w.clue === null) return w.psychic ? 'Pas d’indice…' : 'Pas d’indice !';
  if (w.psychic) return r.pointsEarned > 0 ? 'Bien joué, médium !' : 'Personne ne t’a suivi…';
  if (w.yours === undefined) return 'Temps écoulé !';
  const distance = Math.abs(w.yours - w.target);
  if (distance <= WAVELENGTH_BANDS[0].distance) return '🎯 Pile dessus !';
  if (r.correct) return 'Bien vu !';
  return r.pointsEarned > 0 ? 'Presque !' : 'Raté !';
}

/**
 * Needles that would overlap are put on different lanes (rows of avatars): each needle takes the
 * first lane whose last needle is at least `minGap` away. Returns the lane of each value, in the
 * order given.
 */
export function needleLanes(values: readonly number[], minGap: number): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const lastOf: number[] = [];
  const lanes = new Array<number>(values.length).fill(0);
  for (const [v, i] of order) {
    let lane = lastOf.findIndex((last) => v - last >= minGap);
    if (lane < 0) lane = lastOf.length;
    lastOf[lane] = v;
    lanes[i] = lane;
  }
  return lanes;
}
