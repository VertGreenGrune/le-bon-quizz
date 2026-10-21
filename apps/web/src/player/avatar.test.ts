import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATARS, isAvatarId } from '@lbq/shared';
import { initialAvatar, loadAvatarChoice, saveAvatarChoice } from './avatarChoice';
import { initialPlayerState, playerReducer } from './playerState';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('avatar choice (localStorage)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the chosen avatar for the next games', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadAvatarChoice()).toBeNull();
    saveAvatarChoice('octopus');
    expect(loadAvatarChoice()).toBe('octopus');
    expect(initialAvatar()).toBe('octopus');
  });

  it('ignores unknown ids and falls back to a random avatar', () => {
    const storage = memoryStorage();
    storage.setItem('lbq:avatar', 'dragon');
    vi.stubGlobal('localStorage', storage);
    expect(loadAvatarChoice()).toBeNull();
    expect(initialAvatar(() => 0)).toBe(AVATARS[0].id);
  });

  it('works without storage (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => saveAvatarChoice('fox')).not.toThrow();
    expect(isAvatarId(initialAvatar())).toBe(true);
  });
});

describe('player state avatar', () => {
  it('comes with the session; a session without one keeps the known avatar', () => {
    const joined = playerReducer(initialPlayerState, {
      type: 'session',
      playerId: 'p',
      nickname: 'Moi',
      avatar: 'lion',
      totalScore: 0,
    });
    expect(joined.avatar).toBe('lion');
    const resumed = playerReducer(joined, {
      type: 'session',
      playerId: 'p',
      nickname: 'Moi',
      totalScore: 10,
    });
    expect(resumed.avatar).toBe('lion');
  });
});
