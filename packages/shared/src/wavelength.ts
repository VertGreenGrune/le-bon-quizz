/**
 * « Sur la même longueur d'onde » (T62, Wavelength-like): one player (the psychic) sees a secret
 * position on a scale between two opposite words and gives a one-line clue; the others place a
 * needle where they think it is. Positions are integers on 0–100 (0 = `left`, 100 = `right`).
 */

/** A scale between two opposite words (« Froid » ↔ « Chaud »). */
export interface WavelengthSpectrum {
  left: string;
  right: string;
}

/** Default times: the psychic's clue, then the guesses. */
export const WAVELENGTH_DEFAULT_CLUE_SEC = 30;
export const WAVELENGTH_MIN_CLUE_SEC = 10;
export const WAVELENGTH_MAX_CLUE_SEC = 120;
export const WAVELENGTH_DEFAULT_GUESS_SEC = 30;
/** Words of a spectrum end: at most this long; at most this many spectra per question. */
export const WAVELENGTH_END_MAX_LENGTH = 30;
export const WAVELENGTH_MAX_SPECTRA = 30;
/** The clue: at most this long. */
export const WAVELENGTH_CLUE_MAX_LENGTH = 40;
/** The secret target is drawn in [MIN, MAX] (never at an end of the scale). */
export const WAVELENGTH_TARGET_MIN = 10;
export const WAVELENGTH_TARGET_MAX = 90;
export const WAVELENGTH_SCALE = 100;

/**
 * Scoring bands, closest first: a needle at most `distance` away from the target earns
 * `basePoints × share`. Further than the last band: 0.
 */
export const WAVELENGTH_BANDS = [
  { distance: 5, share: 1 },
  { distance: 12, share: 0.6 },
  { distance: 20, share: 0.3 },
] as const;
/** A needle this close (or closer) is a right answer (streak, « Survie »). */
export const WAVELENGTH_CORRECT_DISTANCE = 12;

/** Points of a needle `distance` away from the target (no time points). */
export function wavelengthPoints(basePoints: number, distance: number): number {
  const band = WAVELENGTH_BANDS.find((b) => distance <= b.distance);
  return band ? Math.round(basePoints * band.share) : 0;
}

/** Built-in scales, used when a question gives none (never twice in a game when possible). */
export const WAVELENGTH_SPECTRA: readonly WavelengthSpectrum[] = [
  { left: 'Froid', right: 'Chaud' },
  { left: 'Nul', right: 'Génial' },
  { left: 'Sain', right: 'Malsain' },
  { left: 'Pour les enfants', right: 'Pour les adultes' },
  { left: 'Inutile', right: 'Indispensable' },
  { left: 'Moche', right: 'Beau' },
  { left: 'Facile', right: 'Difficile' },
  { left: 'Bon marché', right: 'Hors de prix' },
  { left: 'Calme', right: 'Bruyant' },
  { left: 'Démodé', right: 'À la mode' },
  { left: 'Triste', right: 'Joyeux' },
  { left: 'Effrayant', right: 'Rassurant' },
  { left: 'Lent', right: 'Rapide' },
  { left: 'Petit', right: 'Énorme' },
  { left: 'Sucré', right: 'Salé' },
  { left: 'Dégoûtant', right: 'Délicieux' },
  { left: 'Ennuyeux', right: 'Passionnant' },
  { left: 'Rare', right: 'Courant' },
  { left: 'Fragile', right: 'Solide' },
  { left: 'Légal', right: 'Illégal' },
  { left: 'Romantique', right: 'Pas romantique' },
  { left: 'Sous-coté', right: 'Surcoté' },
  { left: 'Naturel', right: 'Artificiel' },
  { left: 'Mou', right: 'Dur' },
  { left: 'Léger', right: 'Lourd' },
  { left: 'Sérieux', right: 'Ridicule' },
  { left: 'Vieux', right: 'Moderne' },
  { left: 'Rural', right: 'Urbain' },
  { left: 'Sportif', right: 'Pas sportif' },
  { left: 'Talent', right: 'Travail' },
  { left: 'Héros', right: 'Méchant' },
  { left: 'Introverti', right: 'Extraverti' },
  { left: 'Réaliste', right: 'Fantastique' },
  { left: 'Le matin', right: 'Le soir' },
  { left: 'Été', right: 'Hiver' },
  { left: 'Mauvaise idée', right: 'Bonne idée' },
  { left: 'Mauvais cadeau', right: 'Bon cadeau' },
  { left: 'Mauvais film', right: 'Bon film' },
  { left: 'Mauvaise série', right: 'Bonne série' },
  { left: 'Mauvais métier', right: 'Bon métier' },
  { left: 'Mauvais animal de compagnie', right: 'Bon animal de compagnie' },
  { left: 'Mauvais super-pouvoir', right: 'Bon super-pouvoir' },
  { left: 'Mauvaise garniture de pizza', right: 'Bonne garniture de pizza' },
  { left: 'Mauvais prénom', right: 'Bon prénom' },
  { left: 'Plat raté', right: 'Plat réussi' },
  { left: 'Petit déjeuner', right: 'Dîner' },
  { left: 'Nourriture', right: 'Boisson' },
  { left: 'Bon pour la santé', right: 'Mauvais pour la santé' },
  { left: 'Écolo', right: 'Polluant' },
  { left: 'Célèbre', right: 'Inconnu' },
  { left: 'Bien payé', right: 'Mal payé' },
  { left: 'Dangereux', right: 'Sans danger' },
  { left: 'Propre', right: 'Sale' },
  { left: 'Simple', right: 'Compliqué' },
  { left: 'Vrai', right: 'Faux' },
  { left: 'Poli', right: 'Impoli' },
  { left: 'Banal', right: 'Bizarre' },
  { left: 'Classe', right: 'Ringard' },
  { left: 'Fait pour durer', right: 'Jetable' },
  { left: 'Surestimé', right: 'Sous-estimé' },
  { left: 'Drôle', right: 'Pas drôle' },
  { left: 'Calorique', right: 'Diététique' },
  { left: 'Mignon', right: 'Terrifiant' },
  { left: 'Intelligent', right: 'Bête' },
  { left: 'Optimiste', right: 'Pessimiste' },
  { left: 'Tendance', right: 'Has-been' },
  { left: 'Odeur agréable', right: 'Odeur horrible' },
  { left: 'Se mange cru', right: 'Se mange cuit' },
  { left: 'Réservé aux pros', right: 'Pour tout le monde' },
  { left: 'Grand public', right: 'Culte' },
];

/** Same spectrum (case-insensitive): used to avoid repeats in a game. */
export function spectrumKey(s: WavelengthSpectrum): string {
  return `${s.left}/${s.right}`.toLocaleLowerCase();
}
