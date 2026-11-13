import {
  COLOR_COUNT,
  COLOR_PALETTE,
  COLOR_SHAPES,
  isBucketZone,
  offeredPalette,
  colorsPoints,
  colorsRight,
  generatedBoard,
  type AnswerInput,
  type ColorBoard,
  type ColorShape,
  type ColorsQuestion,
  type ColorsReveal,
  type OfferedColor,
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
 * 2. `answer` (`timeLimitSec`, new timer): the board loses its colors (T65: the blank picture,
 *    zones in white; older questions: grey); every phone gets the zones' places (never their
 *    colors) and the offered palette — only the board's colors, sorted by hue (T65) — and sends
 *    `player:answer { colors }` (an index in that palette per zone, -1 = none). The server judges
 *    the colors, not the indexes. Points = time points (from the stage start) × share of the zones
 *    right; right = every zone right.
 */
export interface ColorsState {
  stage: 'memo' | 'answer';
  /** The whole board (colored picture and blank picture), without the colors. */
  board: ColorBoard;
  /** The right color of each zone (`#rrggbb`). */
  colors: string[];
  /** The colors offered to the players (distinct board colors, sorted by hue). */
  palette: OfferedColor[];
}

function withPalette(state: Omit<ColorsState, 'palette'>): ColorsState {
  return { ...state, palette: offeredPalette(state.colors) };
}

/**
 * Picture board: the zones as written in the quiz. Generated board: `cells` shapes (all different
 * up to 8) with random colors (never all the same).
 */
export function newColors(q: ColorsQuestion, random: () => number = Math.random): ColorsState {
  if (q.zones.length > 0)
    return withPalette({
      stage: 'memo',
      board: {
        imageUrl: q.imageUrl!,
        ...(q.blankImageUrl && { blankImageUrl: q.blankImageUrl }),
        spots: q.zones.map((z) =>
          isBucketZone(z) ? { x: z.x, y: z.y } : { x: z.x, y: z.y, radius: z.radius },
        ),
      },
      colors: q.zones.map((z) => z.color),
    });
  const shapes: ColorShape[] = [];
  while (shapes.length < q.cells) shapes.push(...shuffle([...COLOR_SHAPES], random));
  shapes.length = q.cells;
  const colors = shapes.map(() => Math.floor(random() * COLOR_COUNT) % COLOR_COUNT);
  if (colors.every((c) => c === colors[0]))
    colors[colors.length - 1] = (colors[0]! + 1) % COLOR_COUNT;
  return withPalette({
    stage: 'memo',
    board: generatedBoard(shapes),
    colors: colors.map((c) => COLOR_PALETTE[c]!.hex),
  });
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

/** The colored board (memorizing): the picture, never the blank one. */
function memoBoard({ blankImageUrl: _blank, ...board }: ColorBoard): ColorBoard {
  return board;
}

/** The board during the answers: the blank picture instead of the colored one when there is one. */
export function answerBoard({ imageUrl, blankImageUrl, ...board }: ColorBoard): ColorBoard {
  if (blankImageUrl) return { ...board, blankImageUrl };
  return imageUrl ? { ...board, imageUrl } : board;
}

/** The TV: the colors only while memorizing (the memo time as the time limit). */
export function colorsShow(q: ColorsQuestion, state: ColorsState): Partial<QuestionShowPayload> {
  return state.stage === 'memo'
    ? {
        colors: { stage: 'memo', board: memoBoard(state.board), colors: [...state.colors] },
        timeLimitSec: q.memoSec,
      }
    : {
        // T65: the colored picture leaves the TV too once there is a blank one.
        ...(state.board.blankImageUrl && { imageUrl: undefined }),
        colors: {
          stage: 'answer',
          board: answerBoard(state.board),
          palette: state.palette.map((c) => ({ ...c })),
        },
      };
}

/** The phones: nothing of the board while memorizing, then its places and the offered colors. */
export function colorsPrompt(
  q: ColorsQuestion,
  state: ColorsState,
): Partial<QuestionPromptPayload> {
  return state.stage === 'memo'
    ? { colors: { stage: 'memo' }, timeLimitSec: q.memoSec }
    : {
        colors: {
          stage: 'answer',
          board: answerBoard(state.board),
          palette: state.palette.map((c) => ({ ...c })),
        },
      };
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
  if (given.colors.some((c) => c >= state.palette.length))
    throw new GameError('INVALID_PAYLOAD', 'Couleur inconnue');
  const colors = given.colors.map((c) => (c >= 0 ? state.palette[c]!.hex : null));
  const right = colorsRight(colors, state.colors);
  const total = state.colors.length;
  return {
    colors,
    correct: right === total,
    points: colorsPoints(timePoints, right, total),
  };
}

/** 50/50: half of the zones (at least one, never all), with their right color. */
export function colorsHints(
  state: ColorsState,
  random: () => number,
): { zone: number; color: string }[] {
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
    board: state.board,
  };
}
