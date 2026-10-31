import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEVELS,
  phaseSound,
  readLevels,
  readMuted,
  shouldTick,
  stepLevel,
  writeLevels,
  writeMuted,
} from './sounds';

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

  it('remembers the two volume levels (100 % by default), independent of « Tout couper »', () => {
    const storage = memoryStorage();
    expect(readLevels(storage)).toEqual(DEFAULT_LEVELS);
    // An old TV only had the mute flag: still muted, levels at 100 %.
    writeMuted(storage, true);
    expect(readLevels(storage)).toEqual({ music: 1, clips: 1 });
    writeLevels(storage, { music: 0.25, clips: 0.8 });
    expect(readLevels(storage)).toEqual({ music: 0.25, clips: 0.8 });
    expect(readMuted(storage)).toBe(true);
    writeLevels(storage, { music: 0, clips: 1 });
    expect(readLevels(storage).music).toBe(0);

    storage.setItem('lbq:host:music-volume', 'abc');
    storage.setItem('lbq:host:clip-volume', '250');
    expect(readLevels(storage)).toEqual({ music: 1, clips: 1 });
    expect(readLevels(undefined)).toEqual(DEFAULT_LEVELS);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readLevels(broken)).toEqual(DEFAULT_LEVELS);
    expect(() => writeLevels(broken, DEFAULT_LEVELS)).not.toThrow();
  });

  it('« Musique − / + » of the remote moves by 20 % between 0 and 100 %', () => {
    expect(stepLevel(1, false)).toBe(0.8);
    expect(stepLevel(1, true)).toBe(1);
    expect(stepLevel(0.2, false)).toBe(0);
    expect(stepLevel(0, false)).toBe(0);
    expect(stepLevel(0, true)).toBe(0.2);
    expect(stepLevel(0.45, true)).toBe(0.6); // a slider value in between: snapped
  });
});
