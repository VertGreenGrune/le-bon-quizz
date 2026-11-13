import { describe, expect, it } from 'vitest';
import { linkPair } from './match';

describe('« Associer » links on the phone (T67)', () => {
  it('links a left item to a right item, moving the right one if it was taken', () => {
    let links = [-1, -1, -1];
    links = linkPair(links, 0, 2);
    expect(links).toEqual([2, -1, -1]);
    links = linkPair(links, 1, 0);
    expect(links).toEqual([2, 0, -1]);
    // B (right 2) was linked to 1 (left 0): it moves to 3 (left 2).
    links = linkPair(links, 2, 2);
    expect(links).toEqual([-1, 0, 2]);
    // Left 2 changes partner.
    expect(linkPair(links, 2, 1)).toEqual([-1, 0, 1]);
  });
});
