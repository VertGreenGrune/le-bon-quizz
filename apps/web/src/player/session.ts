import { isAvatarId, type AvatarId } from '@lbq/shared';

/** Player session kept in sessionStorage so a reload / phone lock can `player:rejoin`. */
export interface PlayerSession {
  pin: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
  /** Absent in sessions saved before avatars. */
  avatar?: AvatarId;
}

const KEY = 'lbq:player-session';

export function loadSession(): PlayerSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<PlayerSession>;
    if (!s.pin || !s.playerId || !s.sessionToken || !s.nickname) return null;
    if (!isAvatarId(s.avatar)) delete s.avatar;
    return s as PlayerSession;
  } catch {
    return null;
  }
}

export function saveSession(session: PlayerSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode / storage disabled: the game still works, only rejoin after reload is lost.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
