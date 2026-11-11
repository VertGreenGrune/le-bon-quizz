import {
  WAVELENGTH_CLUE_MAX_LENGTH,
  WAVELENGTH_CORRECT_DISTANCE,
  WAVELENGTH_SCALE,
  WAVELENGTH_SPECTRA,
  WAVELENGTH_TARGET_MAX,
  WAVELENGTH_TARGET_MIN,
  spectrumKey,
  wavelengthPoints,
  type LobbyMember,
  type PlayerResultPayload,
  type RevealDetails,
  type TeamId,
  type WavelengthPrompt,
  type WavelengthQuestion,
  type WavelengthShow,
  type WavelengthSpectrum,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import { normalizeAnswer } from '../matching.js';
import type { Answer, Player } from '../Game.js';
import { pickDrawer, type DrawRotation } from './draw.js';

/**
 * WAVELENGTH — « Sur la même longueur d'onde » (T62, PLAN.md §3, Wavelength-like). At
 * QUESTION_INTRO the server picks the psychic (the « Dessine-moi » rotation), a scale and a secret
 * target (10–90 on 0–100). ANSWERING has two stages:
 * 1. `clue` (`clueTimeSec`): only the psychic's phone gets the target; they send one clue
 *    (`player:answer { text }`, final; refused when it uses a word of the scale's ends).
 * 2. `guess` (`timeLimitSec`): the others place a needle (`{ value }` 0–100, the scored answer).
 * A needle ≤ 5 away = `basePoints`, ≤ 12 = 60 %, ≤ 20 = 30 % (`correct` = ≤ 12); the psychic gets
 * the average of the guessers' points. No time points. No clue → revealed at once, nobody scores.
 */
export interface WavelengthState {
  stage: 'clue' | 'guess';
  /** null when nobody could be the psychic (no player). */
  psychicId: string | null;
  spectrum: WavelengthSpectrum;
  /** Integer in [WAVELENGTH_TARGET_MIN, WAVELENGTH_TARGET_MAX]. */
  target: number;
  clue: string | null;
}

/** One of the question's scales, or of the built-in list (not used yet in this game if possible). */
export function pickSpectrum(
  q: WavelengthQuestion,
  used: ReadonlySet<string>,
  random: () => number = Math.random,
): WavelengthSpectrum {
  const list = q.spectra.length > 0 ? q.spectra : WAVELENGTH_SPECTRA;
  const fresh = list.filter((s) => !used.has(spectrumKey(s)));
  const from = fresh.length > 0 ? fresh : list;
  const s = from[Math.floor(random() * from.length)]!;
  return { left: s.left, right: s.right };
}

/** The secret target: an integer, never at an end of the scale. */
export function pickTarget(random: () => number = Math.random): number {
  const span = WAVELENGTH_TARGET_MAX - WAVELENGTH_TARGET_MIN + 1;
  return WAVELENGTH_TARGET_MIN + Math.min(span - 1, Math.floor(random() * span));
}

/**
 * The question starts: the next psychic in turn (the « Dessine-moi » rule — the fewest turns
 * first, teams take turns; its own rotation, `usedWords` = the scales used), a scale, a target.
 */
export function startWavelength(
  q: WavelengthQuestion,
  players: readonly Player[],
  rotation: DrawRotation,
  teamIds: readonly TeamId[],
  random: () => number = Math.random,
): WavelengthState {
  const psychic = pickDrawer(players, rotation, teamIds);
  const spectrum = pickSpectrum(q, rotation.usedWords, random);
  rotation.usedWords.add(spectrumKey(spectrum));
  if (psychic) {
    rotation.counts.set(psychic.id, (rotation.counts.get(psychic.id) ?? 0) + 1);
    rotation.lastTeam = psychic.teamId;
  }
  return {
    stage: 'clue',
    psychicId: psychic?.id ?? null,
    spectrum,
    target: pickTarget(random),
    clue: null,
  };
}

/** Small words that don't give anything away (articles, prepositions…). */
const STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'de',
  'des',
  'du',
  'd',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'ou',
  'pas',
  'pour',
  'sur',
  'un',
  'une',
]);

/** Normalized words of a text, a final plural « s » / « x » dropped. */
function words(text: string): string[] {
  return normalizeAnswer(text)
    .split(' ')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
}

/** The word of the scale's ends a clue uses (normalized), if any. */
export function forbiddenWord(spectrum: WavelengthSpectrum, clue: string): string | undefined {
  const banned = new Set([...words(spectrum.left), ...words(spectrum.right)]);
  return words(clue).find((w) => banned.has(w));
}

/** Stage 1: the psychic's clue (final). Starting the guesses is up to `Game`. */
export function writeClue(state: WavelengthState, playerId: string, text: string): void {
  if (state.stage !== 'clue' || playerId !== state.psychicId)
    throw new GameError('INVALID_PAYLOAD', 'Seul le joueur qui voit la cible donne l’indice');
  const clue = text.trim().replace(/\s+/g, ' ').slice(0, WAVELENGTH_CLUE_MAX_LENGTH);
  if (!clue) throw new GameError('INVALID_PAYLOAD', 'Écris un indice');
  if (forbiddenWord(state.spectrum, clue))
    throw new GameError(
      'CLUE_REFUSED',
      `Ton indice ne doit pas reprendre « ${state.spectrum.left} » ni « ${state.spectrum.right} »`,
    );
  state.clue = clue;
}

export function startGuesses(state: WavelengthState): void {
  state.stage = 'guess';
}

/** Stage 2 answer: a needle 0–100, scored by its distance to the target. */
export function judgeNeedle(
  q: WavelengthQuestion,
  state: WavelengthState,
  value: number,
): Pick<Answer, 'value' | 'correct' | 'points'> {
  if (state.stage !== 'guess') throw new GameError('INVALID_PAYLOAD', 'Attends l’indice !');
  if (!Number.isFinite(value) || value < 0 || value > WAVELENGTH_SCALE)
    throw new GameError('INVALID_PAYLOAD', 'Position invalide');
  const distance = Math.abs(value - state.target);
  return {
    value,
    correct: distance <= WAVELENGTH_CORRECT_DISTANCE,
    points: wavelengthPoints(q.basePoints, distance),
  };
}

/**
 * The psychic's points: the average of the guessers' points. Guessers = the other players still
 * connected, plus those who placed a needle (an absent player doesn't count).
 */
export function psychicPoints(state: WavelengthState, players: Iterable<Player>): number {
  if (state.clue === null) return 0;
  const guessers = [...players].filter(
    (p) => p.id !== state.psychicId && (p.socketId !== null || p.answer),
  );
  if (guessers.length === 0) return 0;
  const sum = guessers.reduce((total, p) => total + (p.answer?.points ?? 0), 0);
  return Math.round(sum / guessers.length);
}

/** Points that don't come from the player's own answer: the psychic's. */
export function wavelengthBonus(
  state: WavelengthState,
  player: Player,
  players: Iterable<Player>,
): number {
  return player.id === state.psychicId ? psychicPoints(state, players) : 0;
}

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

function psychicOf(state: WavelengthState, players: ReadonlyMap<string, Player>) {
  const p = state.psychicId ? players.get(state.psychicId) : undefined;
  return p ? { psychic: member(p) } : {};
}

/** TV: the scale and the psychic, then the clue — never the target. */
export function wavelengthShow(
  state: WavelengthState,
  players: ReadonlyMap<string, Player>,
): WavelengthShow {
  const base = { ...psychicOf(state, players), spectrum: state.spectrum };
  return state.stage === 'clue'
    ? { stage: 'clue', ...base }
    : { stage: 'guess', ...base, clue: state.clue ?? '' };
}

/** One phone: the target for the psychic only. */
export function wavelengthPrompt(
  state: WavelengthState,
  players: ReadonlyMap<string, Player>,
  playerId: string,
): WavelengthPrompt {
  const base = {
    ...psychicOf(state, players),
    spectrum: state.spectrum,
    ...(playerId !== '' && playerId === state.psychicId && { target: state.target }),
  };
  return state.stage === 'clue'
    ? { stage: 'clue', ...base, maxLength: WAVELENGTH_CLUE_MAX_LENGTH }
    : { stage: 'guess', ...base, clue: state.clue ?? '' };
}

/** Reveal (also saved in the report): target, clue, every needle closest first. */
export function wavelengthReveal(
  state: WavelengthState,
  players: ReadonlyMap<string, Player>,
): RevealDetails {
  const needles = [...players.values()]
    .filter((p) => p.answer?.value != null)
    .map((p) => ({ ...member(p), value: p.answer!.value!, points: p.answer!.points }))
    .sort(
      (a, b) =>
        Math.abs(a.value - state.target) - Math.abs(b.value - state.target) || b.points - a.points,
    );
  return {
    wavelength: {
      spectrum: state.spectrum,
      target: state.target,
      clue: state.clue,
      ...psychicOf(state, players),
      needles,
      psychicPoints: psychicPoints(state, players.values()),
    },
  };
}

/** `player:result.wavelength`. */
export function wavelengthResult(
  state: WavelengthState,
  player: Player,
  players: ReadonlyMap<string, Player>,
): Partial<PlayerResultPayload> {
  const psychic = state.psychicId ? players.get(state.psychicId) : undefined;
  const value = player.answer?.value;
  return {
    wavelength: {
      spectrum: state.spectrum,
      target: state.target,
      clue: state.clue,
      psychic: player.id === state.psychicId,
      ...(psychic && { psychicName: psychic.nickname }),
      ...(value != null && { yours: value }),
    },
  };
}
