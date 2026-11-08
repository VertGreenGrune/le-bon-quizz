import { randomInt } from 'node:crypto';
import { PIN_LENGTH, type Quiz } from '@lbq/shared';
import { GameError } from './errors.js';
import { Game, type GameHooks, type GameSettings, type GameTransport } from './Game.js';

/** Games idle for this long (no host/player action) are dropped. */
export const GAME_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/**
 * ENDED games are kept a little so reconnecting clients still see the ENDED state — and as long
 * as their host screen is connected, so the host can pick the next quiz (« Quiz suivant », T47).
 */
export const ENDED_GAME_TTL_MS = 5 * 60 * 1000;
/** A game whose host screen has been gone this long is ended (and saved if it started). */
export const HOST_GONE_TTL_MS = 10 * 60 * 1000;

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

  create(
    quiz: Quiz,
    makeTransport: (pin: string) => GameTransport,
    hooks?: GameHooks,
    settings?: GameSettings,
  ): Game {
    const pin = generatePin((p) => this.games.has(p));
    const game = new Game(pin, quiz, makeTransport(pin), hooks, settings);
    this.games.set(pin, game);
    return game;
  }

  /**
   * « 🔁 Quiz suivant » (T47), PODIUM / ENDED: ends the current quiz (saved through its
   * `onEnded`) and puts a new one in the same room — same PIN, tokens, TV / remotes and players
   * (scores from zero), in LOBBY. The caller checks access to `quiz` first.
   */
  nextRound(pin: string, quiz: Quiz, hooks?: GameHooks, settings?: GameSettings): Game {
    const previous = this.get(pin);
    if (previous.phase !== 'PODIUM' && previous.phase !== 'ENDED')
      throw new GameError('GAME_ALREADY_STARTED', 'Le quiz en cours n’est pas terminé');
    previous.end();
    const room = previous.carryOver();
    previous.dispose();
    const game = new Game(pin, quiz, room.transport, hooks, {
      mode: 'solo',
      ...settings,
      hostUserId: settings?.hostUserId ?? previous.hostUserId,
      room,
    });
    this.games.set(pin, game);
    game.announceLobby();
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

  /**
   * Ends abandoned games — idle, or host screen gone for HOST_GONE_TTL_MS — which saves them
   * through `onEnded` if they started and sends ENDED to the players. Drops idle games and
   * ENDED games past their grace period.
   */
  sweep(now = Date.now()): void {
    for (const [pin, game] of this.games) {
      const idle = now - game.lastActivityAt;
      const hostGone = game.hostGoneSince !== null && now - game.hostGoneSince > HOST_GONE_TTL_MS;
      if (idle > GAME_IDLE_TTL_MS) {
        game.end();
        this.remove(pin);
      } else if (game.phase === 'ENDED') {
        if (idle > ENDED_GAME_TTL_MS && !game.hostOnline) this.remove(pin);
      } else if (hostGone) {
        game.end(); // kept for the ENDED grace period from now on
      }
    }
  }
}
