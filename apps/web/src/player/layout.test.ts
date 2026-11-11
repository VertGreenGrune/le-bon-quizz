import { describe, expect, it } from 'vitest';
import type { GameStatePayload, PlayerJokersPayload, QuestionPromptPayload } from '@lbq/shared';
import { formatGain } from '../components/GainBadge';
import { jokerBarMode } from './jokers';
import { pictureMaxHeight } from './moreAnswers';
import { initialPlayerState, playerReducer, type PlayerState } from './playerState';

// T41: the joker bar never covers « Valider », the PIN picture fits the free height.

const state = (over: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 1,
  totalQuestions: 4,
  remainingMs: 20_000,
  jokers: true,
  ...over,
});
const jokers = (over: Partial<PlayerJokersPayload> = {}): PlayerJokersPayload => ({
  questionIndex: 1,
  questionType: 'MCQ',
  hand: ['double'],
  others: [],
  attacked: [],
  effects: {},
  ...over,
});

function phone(prompt: Partial<QuestionPromptPayload> & Pick<QuestionPromptPayload, 'type'>) {
  let s: PlayerState = playerReducer(initialPlayerState, {
    type: 'state',
    payload: state(),
    now: 0,
  });
  s = playerReducer(s, { type: 'jokers', payload: jokers({ questionType: prompt.type }) });
  return playerReducer(s, {
    type: 'prompt',
    payload: { index: 1, timeLimitSec: 20, ...prompt } as QuestionPromptPayload,
    now: 0,
  });
}

describe('joker bar placement', () => {
  it('keeps the bar on the shape-button screens and the « get ready » screen', () => {
    expect(jokerBarMode(phone({ type: 'MCQ', choiceCount: 4 }), 'answer')).toBe('bar');
    expect(jokerBarMode(phone({ type: 'TRUE_FALSE', choiceCount: 2 }), 'answer')).toBe('bar');
    expect(jokerBarMode(phone({ type: 'PIN', imageUrl: 'x' }), 'getReady')).toBe('bar');
  });

  it('collapses to the header button on the screens that need the whole height', () => {
    expect(jokerBarMode(phone({ type: 'PIN', imageUrl: 'x' }), 'answer')).toBe('chip');
    expect(jokerBarMode(phone({ type: 'ORDER', items: ['a', 'b', 'c'] }), 'answer')).toBe('chip');
    const slider = { min: 0, max: 10, step: 1 };
    expect(jokerBarMode(phone({ type: 'SLIDER', slider }), 'answer')).toBe('chip');
    expect(jokerBarMode(phone({ type: 'TYPE_ANSWER', maxLength: 40 }), 'answer')).toBe('chip');
    const write = { stage: 'write', maxLength: 40 } as const;
    expect(jokerBarMode(phone({ type: 'BLUFF', bluff: write }), 'answer')).toBe('chip');
    // « Couleurs perdues »: the big bar while memorizing, the chip on the board (T58).
    expect(jokerBarMode(phone({ type: 'COLORS', colors: { stage: 'memo' } }), 'answer')).toBe(
      'bar',
    );
    const board = { cols: 2, rows: 2, spots: [] };
    expect(
      jokerBarMode(phone({ type: 'COLORS', colors: { stage: 'answer', board } }), 'answer'),
    ).toBe('chip');
    // « Qu’est-ce qui a disparu ? »: the bar while memorizing, the chip on the picture (T59).
    expect(jokerBarMode(phone({ type: 'MISSING', missing: { stage: 'memo' } }), 'answer')).toBe(
      'bar',
    );
    expect(
      jokerBarMode(
        phone({ type: 'MISSING', missing: { stage: 'answer' }, imageUrl: 'apres.png' }),
        'answer',
      ),
    ).toBe('chip');
  });

  it('is hidden outside the question screens, while paused and without jokers here', () => {
    const s = phone({ type: 'PIN', imageUrl: 'x' });
    // « Réponse envoyée ! » keeps the bar while the others answer (T42), not after the reveal.
    expect(jokerBarMode(s, 'answered')).toBe('bar');
    const revealed = playerReducer(s, {
      type: 'state',
      payload: state({ phase: 'REVEAL' }),
      now: 0,
    });
    expect(jokerBarMode(revealed, 'answered')).toBe('hidden');
    expect(jokerBarMode(revealed, 'result')).toBe('hidden');
    expect(jokerBarMode({ ...s, jokerGame: false }, 'answer')).toBe('hidden');
    const paused = playerReducer(s, {
      type: 'state',
      payload: state({ paused: { waitingFor: [], hostMissing: true, sinceMs: 0 } }),
      now: 0,
    });
    expect(jokerBarMode(paused, 'answer')).toBe('hidden');
    expect(jokerBarMode(phone({ type: 'POLL', choiceCount: 3 }), 'answer')).toBe('hidden');
  });
});

describe('PIN picture height', () => {
  it('takes the measured area minus the zoom buttons, never less than 120 px', () => {
    expect(pictureMaxHeight(500)).toBe(436);
    expect(pictureMaxHeight(100)).toBe(120);
    expect(pictureMaxHeight(null)).toBeGreaterThan(0); // before the first measure
  });
});

describe('leaderboard gains', () => {
  it('« +850 », « +0 », « −500 »', () => {
    expect(formatGain(850)).toBe('+850');
    expect(formatGain(0)).toBe('+0');
    expect(formatGain(-500)).toBe('−500');
  });
});
