import { describe, expect, it } from 'vitest';
import { competitionRanks } from './ranks';

describe('competitionRanks', () => {
  it('shares ranks on ties and skips after them', () => {
    expect(competitionRanks([900, 500, 500, 100])).toEqual([1, 2, 2, 4]);
    expect(competitionRanks([3, 3])).toEqual([1, 1]);
    expect(competitionRanks([])).toEqual([]);
  });
});
