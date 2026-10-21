import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_TTL_MS, clearSession, loadSession, saveSession } from './session';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const session = (pin: string, nickname = 'Alice') => ({
  pin,
  playerId: `p-${pin}`,
  sessionToken: `t-${pin}`,
  nickname,
  avatar: 'batman' as const,
});

describe('player session (localStorage, keyed by PIN)', () => {
  let local: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    local = memoryStorage();
    vi.stubGlobal('localStorage', local);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('survives a closed tab: only localStorage is kept, not sessionStorage', async () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    saveSession(session('123456'));

    // "Tab closed and reopened": fresh module instance, fresh sessionStorage, same localStorage.
    vi.resetModules();
    vi.stubGlobal('sessionStorage', memoryStorage());
    const fresh = await import('./session');
    expect(fresh.loadSession()).toEqual(session('123456'));
    expect(fresh.loadSession('123456')?.sessionToken).toBe('t-123456');
  });

  it('keeps one session per PIN; without a PIN, the game joined last', () => {
    saveSession(session('111111', 'A'), Date.now() - 2_000);
    saveSession(session('222222', 'B'), Date.now() - 1_000);
    expect(loadSession('111111')?.nickname).toBe('A');
    expect(loadSession()?.pin).toBe('222222');
    expect(loadSession('999999')).toBeNull();
  });

  it('is removed by PIN (game over) or the last one by default', () => {
    saveSession(session('111111'), Date.now() - 2_000);
    saveSession(session('222222'), Date.now() - 1_000);
    clearSession('111111');
    expect(loadSession('111111')).toBeNull();
    expect(loadSession('222222')).not.toBeNull();
    clearSession();
    expect(loadSession()).toBeNull();
    expect(local.getItem('lbq:player-sessions')).toBeNull();
  });

  it('ignores old or broken entries', () => {
    saveSession(session('111111'), Date.now() - SESSION_TTL_MS - 1);
    expect(loadSession('111111')).toBeNull();
    local.setItem('lbq:player-sessions', '{not json');
    expect(loadSession()).toBeNull();
    local.setItem('lbq:player-sessions', JSON.stringify({ '123456': { pin: '123456' } }));
    expect(loadSession()).toBeNull();
  });

  it('works (without persistence) when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    });
    expect(() => saveSession(session('123456'))).not.toThrow();
    expect(loadSession()).toBeNull();
  });
});
