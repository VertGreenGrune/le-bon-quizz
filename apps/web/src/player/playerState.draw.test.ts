import { describe, expect, it } from 'vitest';
import type { DrawStroke, GameStatePayload, LobbyMember } from '@lbq/shared';
import { currentDrawing, hostReducer, initialHostState } from '../host/hostReducer';
import { strokePath } from '../components/Drawing';
import {
  drawRole,
  foundTheWord,
  initialPlayerState,
  playerReducer,
  playerScreen,
  type PlayerState,
} from './playerState';

const me: LobbyMember = { id: 'me', nickname: 'Moi', avatar: 'batman' };
const bob: LobbyMember = { id: 'bob', nickname: 'Bob', avatar: 'robin' };
const state = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 0,
  totalQuestions: 2,
  remainingMs: 60_000,
  ...extra,
});
const stroke = (id: number, points: number[]): DrawStroke => ({ id, color: 0, size: 1, points });

function inDrawQuestion(word?: string): PlayerState {
  let s: PlayerState = { ...initialPlayerState, playerId: 'me' };
  s = playerReducer(s, {
    type: 'state',
    payload: state({ draw: { drawer: bob, found: [] } }),
    now: 0,
  });
  return playerReducer(s, {
    type: 'prompt',
    payload: {
      index: 0,
      type: 'DRAW',
      timeLimitSec: 90,
      draw: { drawer: bob, hint: '____', maxLength: 40, ...(word && { word }) },
    },
    now: 0,
  });
}

describe('phone, « Dessine-moi »', () => {
  it('drawer when the prompt has the word, guesser otherwise', () => {
    expect(drawRole(inDrawQuestion('chat'))).toBe('drawer');
    expect(drawRole(inDrawQuestion())).toBe('guesser');
    expect(drawRole(initialPlayerState)).toBeNull();
  });

  it('a found word shows « Trouvé ! », also after a reload (no prompt, from game:state)', () => {
    let s = inDrawQuestion();
    expect(playerScreen(s)).toBe('answer');
    s = playerReducer(s, {
      type: 'state',
      payload: state({ draw: { drawer: bob, found: [me] } }),
      now: 1,
    });
    expect(foundTheWord(s)).toBe(true);
    expect(playerScreen(s)).toBe('answered');

    let reloaded: PlayerState = { ...initialPlayerState, playerId: 'me' };
    reloaded = playerReducer(reloaded, {
      type: 'state',
      payload: state({ draw: { drawer: bob, found: [me] } }),
      now: 0,
    });
    expect(playerScreen(reloaded)).toBe('answered');
  });

  it('the drawer gets its drawing back: a full re-send bumps the version', () => {
    let s = inDrawQuestion('chat');
    s = playerReducer(s, {
      type: 'drawStrokes',
      payload: { index: 0, clear: true, strokes: [stroke(1, [1, 2])] },
    });
    expect(s.drawing).toEqual({ index: 0, strokes: [stroke(1, [1, 2])], version: 1 });
    s = playerReducer(s, {
      type: 'drawStrokes',
      payload: { index: 0, clear: true, strokes: [stroke(1, [1, 2, 3, 4])] },
    });
    expect(s.drawing?.version).toBe(2);
  });
});

describe('TV, « Dessine-moi »', () => {
  it('appends the live chunks, starts over on clear / a new question', () => {
    let s = hostReducer(initialHostState, {
      type: 'state',
      payload: state({ draw: { drawer: bob, found: [] } }),
      now: 0,
    });
    expect(s.draw?.drawer).toEqual(bob);
    s = hostReducer(s, {
      type: 'drawStrokes',
      payload: { index: 0, strokes: [stroke(1, [1, 1])] },
    });
    s = hostReducer(s, {
      type: 'drawStrokes',
      payload: { index: 0, strokes: [stroke(1, [2, 2]), stroke(2, [5, 5])] },
    });
    expect(currentDrawing(s)).toEqual([stroke(1, [1, 1, 2, 2]), stroke(2, [5, 5])]);
    s = hostReducer(s, {
      type: 'drawStrokes',
      payload: { index: 0, clear: true, strokes: [stroke(3, [9, 9])] },
    });
    expect(currentDrawing(s)).toEqual([stroke(3, [9, 9])]);
    // Next question: the old drawing doesn't show.
    s = hostReducer(s, { type: 'state', payload: state({ questionIndex: 1 }), now: 1 });
    expect(currentDrawing(s)).toEqual([]);
    expect(s.draw).toBeNull();
  });

  it('SVG path of a stroke; a single point is a dot', () => {
    expect(strokePath([1, 2, 3, 4, 5, 6])).toBe('M1 2L3 4L5 6');
    expect(strokePath([7, 8])).toBe('M7 8l0.01 0');
    expect(strokePath([])).toBe('');
  });
});
