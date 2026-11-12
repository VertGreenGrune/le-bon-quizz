import { describe, expect, it } from 'vitest';
import type { GameStatePayload } from '@lbq/shared';
import { initialPlayerState, playerReducer, playerScreen, type PlayerState } from './playerState';
import { hostReducer, initialHostState, isBidding } from '../host/hostReducer';

const state = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'QUESTION_INTRO',
  mode: 'solo',
  questionIndex: 1,
  totalQuestions: 3,
  remainingMs: 10_000,
  auction: { stage: 'bid', questionType: 'MCQ', topic: 'Cinéma', bidders: [] },
  ...extra,
});

describe('« Enchères » on the phone and the TV (T64)', () => {
  it('phone: the bid screen during the bid stage, then « get ready »', () => {
    let s: PlayerState = playerReducer(initialPlayerState, {
      type: 'state',
      payload: state(),
      now: 0,
    });
    expect(playerScreen(s)).toBe('bid');
    s = playerReducer(s, { type: 'auctionBid', payload: { index: 1, max: 1000, amount: 0 } });
    s = playerReducer(s, { type: 'bidPlaced', questionIndex: 1, amount: 400 });
    expect(s.bid).toEqual({ questionIndex: 1, max: 1000, amount: 400 });
    // An ack for another question is ignored.
    expect(playerReducer(s, { type: 'bidPlaced', questionIndex: 0, amount: 50 }).bid?.amount).toBe(
      400,
    );
    s = playerReducer(s, {
      type: 'state',
      payload: state({ auction: { stage: 'play', questionType: 'MCQ', bidders: [] } }),
      now: 0,
    });
    expect(playerScreen(s)).toBe('getReady');
  });

  it('TV: bidding until the stage ends, nothing left at the next question', () => {
    let h = hostReducer(initialHostState, { type: 'state', payload: state(), now: 0 });
    expect(isBidding(h)).toBe(true);
    expect(h.auction?.topic).toBe('Cinéma');
    h = hostReducer(h, {
      type: 'state',
      payload: state({ auction: { stage: 'play', questionType: 'MCQ', bidders: [] } }),
      now: 0,
    });
    expect(isBidding(h)).toBe(false);
    h = hostReducer(h, {
      type: 'state',
      payload: state({ questionIndex: 2, auction: undefined }),
      now: 0,
    });
    expect(h.auction).toBeNull();
  });
});
