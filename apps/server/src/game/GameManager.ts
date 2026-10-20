import { randomInt } from 'node:crypto';
import { PIN_LENGTH, type Quiz } from '@lbq/shared';
import { GameError } from './errors.js';
import { Game, type GameTransport } from './Game.js';

/** Games idle for this long (no host/player action) are dropped. */
export const GAME_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** ENDED games are kept a little so reconnecting clients still see the ENDED state. */
export const ENDED_GAME_TTL_MS = 5 * 60 * 1000;

export function generatePin(isTaken: (pin: string) => boolean): string {
  for (let i = 0; i < 1000; i++) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    if (!isTaken(pin)) return pin;
  }
  throw new Error('Could not generate a free PIN');
}

/** In-memory registry of live games (`Map<pin, Game>`, PLAN.md §5). */
export class GameManager {
  private readonly games = new Map<string, Game>();

  create(quiz: Quiz, makeTransport: (pin: string) => GameTransport): Game {
    const pin = generatePin((p) => this.games.has(p));
    const game = new Game(pin, quiz, makeTransport(pin));
    this.games.set(pin, game);
    return game;
  }

  get(pin: string): Game {
    const game = this.games.get(pin);
    if (!game) throw new GameError('GAME_NOT_FOUND', 'Partie introuvable');
    return game;
  }

  find(pin: string): Game | undefined {
    return this.games.get(pin);
  }

  remove(pin: string): void {
    this.games.get(pin)?.dispose();
    this.games.delete(pin);
  }

  get size(): number {
    return this.games.size;
  }

  /** Drops idle games and ENDED games past their grace period. */
  sweep(now = Date.now()): void {
    for (const [pin, game] of this.games) {
      const idle = now - game.lastActivityAt;
      if (idle > GAME_IDLE_TTL_MS || (game.phase === 'ENDED' && idle > ENDED_GAME_TTL_MS)) {
        this.remove(pin);
      }
    }
  }
}
