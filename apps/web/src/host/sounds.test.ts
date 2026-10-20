import { describe, expect, it } from 'vitest';
import { phaseSound, readMuted, shouldTick, writeMuted } from './sounds';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('host sounds', () => {
  it('plays reveal / podium on phase changes, never on the first state after a reload', () => {
    expect(phaseSound('ANSWERING', 'REVEAL')).toBe('reveal');
    expect(phaseSound('LEADERBOARD', 'PODIUM')).toBe('podium');
    expect(phaseSound(null, 'REVEAL')).toBeNull();
    expect(phaseSound(null, 'PODIUM')).toBeNull();
    expect(phaseSound('REVEAL', 'REVEAL')).toBeNull();
    expect(phaseSound('REVEAL', 'LEADERBOARD')).toBeNull();
  });

  it('ticks during the last 5 seconds of ANSWERING only', () => {
    expect(shouldTick('ANSWERING', 6)).toBe(false);
    expect(shouldTick('ANSWERING', 5)).toBe(true);
    expect(shouldTick('ANSWERING', 1)).toBe(true);
    expect(shouldTick('ANSWERING', 0)).toBe(false);
    expect(shouldTick('QUESTION_INTRO', 3)).toBe(false);
    expect(shouldTick('ANSWERING', null)).toBe(false);
  });

  it('remembers the mute choice, and survives a missing or throwing storage', () => {
    const storage = memoryStorage();
    expect(readMuted(storage)).toBe(false);
    writeMuted(storage, true);
    expect(readMuted(storage)).toBe(true);
    writeMuted(storage, false);
    expect(readMuted(storage)).toBe(false);

    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readMuted(broken)).toBe(false);
    expect(() => writeMuted(broken, true)).not.toThrow();
    expect(readMuted(undefined)).toBe(false);
  });
});
