import { GameError } from '../game/errors.js';

/** Wrong codes a socket may send before `host:cast` is refused for a while. */
export const MAX_WRONG_CODES = 5;
export const WRONG_CODES_WINDOW_MS = 60_000;

/**
 * « 📺 Afficher sur la TV » (T47): the `/tv` pages (Fire TV browser…) waiting for a game, by
 * their 4-digit code. In memory, like the games: one server process. A code lives as long as
 * its socket and is dropped once paired.
 */
export class TvPairing {
  private readonly bySocket = new Map<string, string>();
  private readonly byCode = new Map<string, string>();
  private readonly wrong = new Map<string, number[]>();

  constructor(
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  /** The code of this socket: its current one, else `wanted` when free, else a new one. */
  register(socketId: string, wanted?: string): string {
    const current = this.bySocket.get(socketId);
    if (current) return current;
    let code = wanted && !this.byCode.has(wanted) ? wanted : null;
    while (!code) {
      const c = String(Math.floor(this.random() * 10_000)).padStart(4, '0');
      if (!this.byCode.has(c)) code = c;
    }
    this.bySocket.set(socketId, code);
    this.byCode.set(code, socketId);
    return code;
  }

  /** The waiting TV socket with that code, removed from the waiting list. */
  claim(code: string, bySocket: string): string {
    const times = (this.wrong.get(bySocket) ?? []).filter(
      (t) => this.now() - t < WRONG_CODES_WINDOW_MS,
    );
    if (times.length >= MAX_WRONG_CODES) {
      throw new GameError('TV_NOT_FOUND', 'Trop de codes faux : réessaie dans une minute.');
    }
    const tv = this.byCode.get(code);
    if (!tv) {
      this.wrong.set(bySocket, [...times, this.now()]);
      throw new GameError(
        'TV_NOT_FOUND',
        'Aucune TV n’affiche ce code. Vérifie le code affiché sur la TV.',
      );
    }
    this.wrong.delete(bySocket);
    this.forget(tv);
    return tv;
  }

  /** Socket gone (or paired): its code is free again. */
  forget(socketId: string): void {
    const code = this.bySocket.get(socketId);
    if (code) this.byCode.delete(code);
    this.bySocket.delete(socketId);
  }

  /** Socket disconnected: also forgets its wrong-code counter. */
  disconnected(socketId: string): void {
    this.forget(socketId);
    this.wrong.delete(socketId);
  }
}
