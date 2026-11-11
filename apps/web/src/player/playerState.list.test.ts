import { describe, expect, it } from 'vitest';
import { initialPlayerState, playerReducer } from './playerState';

describe('« Liste chrono » on the phone', () => {
  it('keeps the items found in the prompt, once each', () => {
    let s = playerReducer(initialPlayerState, {
      type: 'prompt',
      payload: {
        index: 0,
        type: 'LIST',
        timeLimitSec: 60,
        list: { total: 3, maxLength: 40, found: [] },
      },
      now: 0,
    });
    const item = { index: 2, text: 'Joyeux' };
    s = playerReducer(s, { type: 'listFound', questionIndex: 0, item });
    s = playerReducer(s, { type: 'listFound', questionIndex: 0, item });
    expect(s.prompt?.list?.found).toEqual([item]);
    // Another question's item is ignored.
    s = playerReducer(s, { type: 'listFound', questionIndex: 1, item: { index: 0, text: 'x' } });
    expect(s.prompt?.list?.found).toEqual([item]);
  });
});
