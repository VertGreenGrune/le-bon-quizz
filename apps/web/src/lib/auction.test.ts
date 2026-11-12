import { describe, expect, it } from 'vitest';
import { auctionDeltaLabel, auctionResultLine, clampBid, quickBids } from './auction';

describe('« Enchères » helpers (T64)', () => {
  it('labels what a bid did', () => {
    expect(auctionDeltaLabel(400)).toBe('+ 400');
    expect(auctionDeltaLabel(-150)).toBe('− 150');
    expect(auctionDeltaLabel(0)).toBe('± 0');
  });

  it('keeps the bid on a step, within 0 … max', () => {
    expect(clampBid(-50, 200)).toBe(0);
    expect(clampBid(260, 1000)).toBe(250);
    expect(clampBid(1200, 1000)).toBe(1000);
    expect(quickBids(1000)).toEqual([0, 250, 500, 1000]);
    expect(quickBids(200)).toEqual([0, 50, 100, 200]);
  });

  it('writes the phone result line', () => {
    expect(auctionResultLine({ bid: 0, delta: 0 })).toBeNull();
    expect(auctionResultLine({ bid: 400, delta: 400 })).toBe('💰 Mise gagnée : + 400 !');
    expect(auctionResultLine({ bid: 400, delta: -400 })).toBe('💰 Mise perdue : − 400');
    expect(auctionResultLine({ bid: 200, delta: 0 })).toBe('💰 Mise de 200 : rien de perdu');
  });
});
