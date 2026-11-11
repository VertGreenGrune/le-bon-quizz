import {
  COLOR_COUNT,
  COLOR_SHAPES,
  colorsPoints,
  colorsRight,
  generatedBoard,
  type AnswerInput,
  type ColorBoard,
  type ColorShape,
  type ColorsQuestion,
  type ColorsReveal,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionShowPayload,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';

/**
 * COLORS — « Couleurs perdues » (T58, PLAN.md §3). ANSWERING has two stages, like « Mytho ! »:
 * 1. `memo` (`memoSec`): the TV shows the colored board; the phones get nothing of it and
 *    can't answer.
 * 2. `answer` (`timeLimitSec`, new timer): the board turns grey; every phone gets the zones'
 *    places (never their colors) and sends `player:answer { colors }` (a palette index per zone,
 *    -1 = none). Points = time points (from the stage start) × share of the zones right; right =
 *    every zone right.
 */
export interface ColorsState {
  stage: 'memo' | 'answer';
  /** The board without its colors. */
  board: ColorBoard;
  /** The right color of each zone. */
  colors: number[];
}

/**
 * Picture board: the zones as written in the quiz. Generated board: `cells` shapes (all different
 * up to 8) with random colors (never all the same).
 */
export function newColors(q: ColorsQuestion, random: () => number = Math.random): ColorsState {
  if (q.zones.length > 0)
    return {
      stage: 'memo',
      board: {
        imageUrl: q.imageUrl!,
        spots: q.zones.map(({ x, y, radius }) => ({ x, y, radius })),
      },
      colors: q.zones.map((z) => z.color),
    };
  const shapes: ColorShape[] = [];
  while (shapes.length < q.cells) shapes.push(...shuffle([...COLOR_SHAPES], random));
  shapes.length = q.cells;
  const colors = shapes.map(() => Math.floor(random() * COLOR_COUNT) % COLOR_COUNT);
  if (colors.every((c) => c === colors[0]))
    colors[colors.length - 1] = (colors[0]! + 1) % COLOR_COUNT;
  return { stage: 'memo', board: generatedBoard(shapes), colors };
}

function shuffle<T>(list: T[], random: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** Stage 2 starts: the board turns grey. */
export function startColorsAnswer(state: ColorsState): void {
  state.stage = 'answer';
}

/** The TV: the colors only while memorizing (the memo time as the time limit). */
export function colorsShow(q: ColorsQuestion, state: ColorsState): Partial<QuestionShowPayload> {
  return state.stage === 'memo'
    ? {
        colors: { stage: 'memo', board: state.board, colors: [...state.colors] },
        timeLimitSec: q.memoSec,
      }
    : { colors: { stage: 'answer', board: state.board } };
}

/** The phones: nothing of the board while memorizing, then its places only. */
export function colorsPrompt(
  q: ColorsQuestion,
  state: ColorsState,
): Partial<QuestionPromptPayload> {
  return state.stage === 'memo'
    ? { colors: { stage: 'memo' }, timeLimitSec: q.memoSec }
    : { colors: { stage: 'answer', board: state.board } };
}

/** Stage 2 answer: a color per zone. */
export function judgeColors(
  state: ColorsState,
  given: AnswerInput,
  timePoints: number,
): Pick<Answer, 'colors' | 'correct' | 'points'> {
  if (state.stage !== 'answer')
    throw new GameError('NOT_ANSWERING', 'Mémorise d’abord les couleurs !');
  if (!('colors' in given))
    throw new GameError('INVALID_PAYLOAD', 'Cette question attend des couleurs');
  if (given.colors.length !== state.colors.length)
    throw new GameError('INVALID_PAYLOAD', 'Une couleur par zone');
  const right = colorsRight(given.colors, state.colors);
  const total = state.colors.length;
  return {
    colors: [...given.colors],
    correct: right === total,
    points: colorsPoints(timePoints, right, total),
  };
}

/** 50/50: half of the zones (at least one, never all), with their right color. */
export function colorsHints(
  state: ColorsState,
  random: () => number,
): { zone: number; color: number }[] {
  const total = state.colors.length;
  const count = Math.min(Math.max(1, Math.floor(total / 2)), total - 1);
  return shuffle(
    state.colors.map((_, i) => i),
    random,
  )
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((zone) => ({ zone, color: state.colors[zone]! }));
}

/** The colored board, how many got each zone, every player's board (best first, no answer last). */
export function colorsReveal(
  state: ColorsState,
  answers: readonly { player: Player; answer: Answer }[],
  players: Iterable<Player>,
): ColorsReveal {
  const zones = state.colors.map(() => 0);
  const rows = answers.map(({ player, answer }) => {
    const colors = answer.colors ?? null;
    colors?.forEach((c, i) => {
      if (c === state.colors[i]) zones[i]!++;
    });
    return {
      nickname: player.nickname,
      avatar: player.avatar,
      colors,
      right: colors ? colorsRight(colors, state.colors) : 0,
      points: answer.points,
      ms: answer.responseMs,
    };
  });
  rows.sort((a, b) => b.right - a.right || b.points - a.points || a.ms - b.ms);
  const answered = new Set(answers.map((a) => a.player));
  const missing = [...players]
    .filter((p) => !answered.has(p))
    .map((p) => ({ nickname: p.nickname, avatar: p.avatar, colors: null, right: 0, points: 0 }));
  return {
    board: state.board,
    colors: [...state.colors],
    zones,
    answers: [...rows.map(({ ms: _ms, ...row }) => row), ...missing],
  };
}

export function colorsResult(state: ColorsState, player: Player): PlayerResultPayload['colors'] {
  const yours = player.answer?.colors;
  return {
    right: yours ? colorsRight(yours, state.colors) : 0,
    total: state.colors.length,
    colors: [...state.colors],
    ...(yours && { yours: [...yours] }),
  };
}
