import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('RateLimiter', () => {
  it('blocks after `limit` hits in the window, then lets go as they expire', () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(limiter.blocked('a')).toBe(false);
      limiter.hit('a');
      now += 100;
    }
    expect(limiter.blocked('a')).toBe(true);
    expect(limiter.blocked('b')).toBe(false);
    now = 1001; // the first hit (t = 0) is out of the window
    expect(limiter.blocked('a')).toBe(false);
  });

  it('reset forgets a key', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.hit('a');
    expect(limiter.blocked('a')).toBe(true);
    limiter.reset('a');
    expect(limiter.blocked('a')).toBe(false);
  });
});
