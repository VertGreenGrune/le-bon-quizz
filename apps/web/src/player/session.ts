import { isAvatarId, type AvatarId } from '@lbq/shared';

/**
 * Player session, kept in localStorage (keyed by PIN) so a reload, a phone lock, a closed tab or
 * a restarted browser can `player:rejoin`. Removed when the game ends, the player is kicked or
 * the session is refused.
 */
export interface PlayerSession {
  pin: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
  /** Absent in sessions saved before avatars. */
  avatar?: AvatarId;
}

const KEY = 'lbq:player-sessions';
/** Older sessions are ignored (games are swept after 2 h idle anyway). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type Stored = Record<string, PlayerSession & { savedAt: number }>;

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null; // storage disabled
  }
}

function readAll(now = Date.now()): Stored {
  try {
    const raw = storage()?.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Stored) : {};
    for (const [pin, s] of Object.entries(all)) {
      const valid = s && s.pin === pin && s.playerId && s.sessionToken && s.nickname && s.savedAt;
      if (!valid || now - s.savedAt > SESSION_TTL_MS) delete all[pin];
      else if (!isAvatarId(s.avatar)) delete s.avatar;
    }
    return all;
  } catch {
    return {};
  }
}

function writeAll(all: Stored): void {
  try {
    const s = storage();
    if (Object.keys(all).length === 0) s?.removeItem(KEY);
    else s?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private mode / storage disabled: the game still works, only rejoin after reload is lost.
  }
}

/** The session of the game with this PIN, or (no PIN) of the game joined last. */
export function loadSession(pin?: string): PlayerSession | null {
  const all = readAll();
  const entry = pin ? all[pin] : Object.values(all).sort((a, b) => b.savedAt - a.savedAt)[0];
  if (!entry) return null;
  const { savedAt: _savedAt, ...session } = entry;
  return session;
}

export function saveSession(session: PlayerSession, now = Date.now()): void {
  writeAll({ ...readAll(now), [session.pin]: { ...session, savedAt: now } });
}

/** Forgets the session of this PIN, or (no PIN) of the game joined last. */
export function clearSession(pin?: string): void {
  const all = readAll();
  const target = pin ?? loadSession()?.pin;
  if (target === undefined || !(target in all)) return;
  delete all[target];
  writeAll(all);
}
