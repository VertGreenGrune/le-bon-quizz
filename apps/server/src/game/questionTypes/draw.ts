import {
  drawerShare,
  DRAW_MAX_POINTS,
  DRAW_MAX_STROKES,
  DRAW_WORDS,
  TYPE_ANSWER_MAX_LENGTH,
  mergeStrokes,
  wordHint,
  type DrawGuess,
  type DrawPrompt,
  type DrawQuestion,
  type DrawStatus,
  type DrawStroke,
  type LobbyMember,
  type PlayerResultPayload,
  type QuestionShowPayload,
  type RevealDetails,
  type TeamId,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import { isNearMiss, matchesAnswer } from '../matching.js';
import type { Answer, Player } from '../Game.js';

/**
 * DRAW — « Dessine-moi » (PLAN.md §3, Pictionary-like). One player (rotating) gets the secret
 * word and draws on their phone; the strokes are relayed to the TV as vector chunks. The others
 * type guesses (`player:answer { text }`): a wrong guess isn't recorded (they try again), a right
 * one is the scored answer (time-based points). The drawer earns
 * `basePoints` × the share of the guessers who found it (`drawerShare`).
 */
export interface DrawState {
  word: string;
  /** null when nobody could draw (no player). */
  drawerId: string | null;
  /** The drawing so far, in drawing order. */
  strokes: DrawStroke[];
  pointCount: number;
}

/** Who drew how many times in this game, and the team of the last drawer (rotation). */
export interface DrawRotation {
  counts: Map<string, number>;
  lastTeam: TeamId | null;
  /** Words already drawn in this game (the built-in list avoids repeats). */
  usedWords: Set<string>;
}

export function newRotation(): DrawRotation {
  return { counts: new Map(), lastTeam: null, usedWords: new Set() };
}

/**
 * Next drawer: among the connected players (everyone if nobody is), those who drew the fewest
 * times — so everyone draws before anyone draws twice. In team mode, the first team after the
 * last drawer's one that has such a player (teams take turns); otherwise join order.
 */
export function pickDrawer(
  players: readonly Player[],
  rotation: DrawRotation,
  teamIds: readonly TeamId[],
): Player | null {
  const online = players.filter((p) => p.socketId !== null);
  const pool = online.length > 0 ? online : players;
  if (pool.length === 0) return null;
  const count = (p: Player) => rotation.counts.get(p.id) ?? 0;
  const fewest = Math.min(...pool.map(count));
  const candidates = pool.filter((p) => count(p) === fewest);
  if (teamIds.length > 0) {
    const start = rotation.lastTeam === null ? 0 : teamIds.indexOf(rotation.lastTeam) + 1;
    for (let k = 0; k < teamIds.length; k++) {
      const team = teamIds[(start + k) % teamIds.length];
      const p = candidates.find((c) => c.teamId === team);
      if (p) return p;
    }
  }
  return candidates[0]!;
}

/** One of the question's words, or of the built-in list (not drawn yet in this game if possible). */
export function pickWord(
  q: DrawQuestion,
  usedWords: ReadonlySet<string>,
  random: () => number = Math.random,
): string {
  const list: readonly string[] = q.words.length > 0 ? q.words : DRAW_WORDS;
  const fresh = list.filter((w) => !usedWords.has(w.toLocaleLowerCase()));
  const from = fresh.length > 0 ? fresh : list;
  return from[Math.floor(random() * from.length)]!;
}

/** The question starts: picks the drawer and the word, and counts the turn. */
export function startDraw(
  q: DrawQuestion,
  players: readonly Player[],
  rotation: DrawRotation,
  teamIds: readonly TeamId[],
  random: () => number = Math.random,
): DrawState {
  const drawer = pickDrawer(players, rotation, teamIds);
  const word = pickWord(q, rotation.usedWords, random);
  rotation.usedWords.add(word.toLocaleLowerCase());
  if (drawer) {
    rotation.counts.set(drawer.id, (rotation.counts.get(drawer.id) ?? 0) + 1);
    rotation.lastTeam = drawer.teamId;
  }
  return { word, drawerId: drawer?.id ?? null, strokes: [], pointCount: 0 };
}

/**
 * Adds the drawer's chunks to the drawing (`clear` empties it first); returns what to relay.
 * `INVALID_PAYLOAD` beyond DRAW_MAX_STROKES / DRAW_MAX_POINTS (nothing is added then).
 */
export function addStrokes(
  state: DrawState,
  chunks: readonly DrawStroke[],
  clear = false,
): DrawStroke[] {
  const strokes = clear ? [] : state.strokes;
  let points = clear ? 0 : state.pointCount;
  const known = new Set(strokes.map((s) => s.id));
  let added = 0;
  for (const c of chunks) {
    points += c.points.length / 2;
    if (!known.has(c.id)) {
      known.add(c.id);
      added++;
    }
  }
  if (strokes.length + added > DRAW_MAX_STROKES || points > DRAW_MAX_POINTS)
    throw new GameError('INVALID_PAYLOAD', 'Dessin trop grand : efface un peu !');
  state.strokes = mergeStrokes(strokes, chunks);
  state.pointCount = points;
  return chunks.map((c) => ({ ...c, points: [...c.points] }));
}

/** A guess: right (with typo tolerance), close (« Presque ! ») or wrong. */
export function checkGuess(state: DrawState, text: string): DrawGuess {
  if (matchesAnswer(text, [state.word], true)) return 'found';
  return isNearMiss(text, state.word) ? 'close' : 'wrong';
}

/** The scored answer of a guesser (only right guesses are recorded). */
export function judgeGuess(
  state: DrawState,
  text: string,
  timePoints: number,
): Pick<Answer, 'text' | 'correct' | 'points'> {
  const guess = text.trim().slice(0, TYPE_ANSWER_MAX_LENGTH);
  const correct = checkGuess(state, guess) === 'found';
  return { text: guess, correct, points: correct ? timePoints : 0 };
}

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

/** Players who found the word, fastest first. */
function finders(players: Iterable<Player>): Player[] {
  return [...players]
    .filter((p) => p.answer?.correct)
    .sort((a, b) => a.answer!.responseMs - b.answer!.responseMs);
}

/**
 * Drawer's points: `basePoints` × the share of the guessers who found the word. Guessers = the
 * other players still connected, plus those who found it (an absent player doesn't count).
 */
export function drawerPoints(q: DrawQuestion, finderCount: number, guesserCount: number): number {
  return drawerShare(q.basePoints, finderCount, guesserCount);
}

function guessers(state: DrawState, players: Iterable<Player>): number {
  return [...players].filter(
    (p) => p.id !== state.drawerId && (p.socketId !== null || p.answer?.correct),
  ).length;
}

/** Points that don't come from the player's own answer: the drawer's. */
export function drawBonus(
  q: DrawQuestion,
  state: DrawState,
  player: Player,
  players: Iterable<Player>,
): number {
  if (player.id !== state.drawerId) return 0;
  const all = [...players];
  return drawerPoints(q, finders(all).length, guessers(state, all));
}

/** `game:state.draw`. */
export function drawStatus(state: DrawState, players: ReadonlyMap<string, Player>): DrawStatus {
  const drawer = state.drawerId ? players.get(state.drawerId) : undefined;
  return {
    ...(drawer && { drawer: member(drawer) }),
    found: finders(players.values()).map(member),
  };
}

/** Host only: who draws and the blanks — never the word (the TV is seen by everyone). */
export function drawShow(
  state: DrawState,
  players: ReadonlyMap<string, Player>,
): QuestionShowPayload['draw'] {
  const drawer = state.drawerId ? players.get(state.drawerId) : undefined;
  return { ...(drawer && { drawer: member(drawer) }), hint: wordHint(state.word) };
}

/** One phone: the word for the drawer only. */
export function drawPrompt(
  state: DrawState,
  players: ReadonlyMap<string, Player>,
  playerId: string,
): DrawPrompt {
  const drawer = state.drawerId ? players.get(state.drawerId) : undefined;
  return {
    ...(drawer && { drawer: member(drawer) }),
    ...(playerId === state.drawerId && { word: state.word }),
    hint: wordHint(state.word),
    maxLength: TYPE_ANSWER_MAX_LENGTH,
  };
}

/** Reveal (also saved in the report): the word, the drawing, who found it. */
export function drawReveal(state: DrawState, players: ReadonlyMap<string, Player>): RevealDetails {
  const drawer = state.drawerId ? players.get(state.drawerId) : undefined;
  return {
    draw: {
      word: state.word,
      ...(drawer && { drawer: member(drawer) }),
      strokes: state.strokes,
      found: finders(players.values()).map((p) => ({ ...member(p), ms: p.answer!.responseMs })),
    },
  };
}

/** `player:result.draw`. */
export function drawResult(
  state: DrawState,
  player: Player,
  players: ReadonlyMap<string, Player>,
): Partial<PlayerResultPayload> {
  const drawer = state.drawerId ? players.get(state.drawerId) : undefined;
  return {
    draw: {
      word: state.word,
      ...(drawer && { drawer: member(drawer) }),
      drew: player.id === state.drawerId,
      found: !!player.answer?.correct,
      finders: finders(players.values()).length,
    },
  };
}
