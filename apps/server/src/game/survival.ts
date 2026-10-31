import {
  hasRightAnswer,
  type GamePhase,
  type HauntType,
  type PlayerResultPayload,
  type Question,
  type RankedPlayer,
  type SurvivalPlayer,
  type SurvivalStatePayload,
} from '@lbq/shared';
import { GameError } from './errors.js';
import type { GameTransport, Player } from './Game.js';
import type { Jokers } from './jokers.js';

/** What the « Survie » rules need from their `Game` (hooks, see `Game.ts`). */
export interface SurvivalContext {
  phase(): GamePhase;
  paused(): boolean;
  players(): ReadonlyMap<string, Player>;
  /** The joker engine carries the haunts' Gel / Brouilleur (created for every « Survie » game). */
  jokers: Jokers;
  transport: GameTransport;
}

/** One player's lives. Kept after a kick (the saved results show their hearts). */
interface Life {
  hearts: number;
  /** Question index of the last heart lost (null while alive). */
  eliminatedAt: number | null;
  lastLoss: number | null;
  /** Ghost: haunts earned (one per correct answer) and not used yet. */
  haunts: number;
  /** What the last revealed question did (`player:result.survival`). */
  result: NonNullable<PlayerResultPayload['survival']> | null;
}

/** `Survival.snapshot()`. */
export type SurvivalSnapshot = Map<string, Life>;

const refuse = (message: string) => new GameError('JOKER_REFUSED', message);

/**
 * « Survie » mode (PLAN.md §3): hearts, ghosts, haunts, early end and the survivor ranking.
 * Server-authoritative; everyone gets the hearts of everyone (`survival:state`).
 */
export class Survival {
  private readonly lives = new Map<string, Life>();
  /** Players when the game started (0 in LOBBY): a game started alone ends with its ghost. */
  private startCount = 0;

  constructor(
    private readonly ctx: SurvivalContext,
    /** Hearts each player starts with. */
    readonly hearts: number,
  ) {}

  private life(id: string): Life {
    let life = this.lives.get(id);
    if (!life) {
      life = { hearts: this.hearts, eliminatedAt: null, lastLoss: null, haunts: 0, result: null };
      this.lives.set(id, life);
    }
    return life;
  }

  isGhost(id: string): boolean {
    return this.life(id).hearts === 0;
  }

  // ---------- Game hooks ----------

  start(): void {
    this.startCount = this.ctx.players().size;
    for (const id of this.ctx.players().keys()) this.life(id);
  }

  /**
   * REVEAL, once the answers are judged: a wrong or missing answer costs a living player a
   * heart (not on questions without a right answer, nor for `spared` players — excused by
   * « Continuer sans » or absent for the whole question); a ghost's correct answer earns a haunt.
   * Partial points (ORDER, PIN) are wrong: only `answer.correct` counts.
   */
  settle(question: Question, questionIndex: number, spared: (p: Player) => boolean): void {
    const scored = hasRightAnswer(question.type);
    for (const p of this.ctx.players().values()) {
      const life = this.life(p.id);
      const correct = p.answer?.correct ?? false;
      const result: NonNullable<Life['result']> = { hearts: life.hearts, lostHeart: false };
      if (scored && life.hearts === 0) {
        if (correct) {
          life.haunts++;
          result.hauntEarned = true;
        }
      } else if (scored && !correct && !spared(p)) {
        life.hearts--;
        life.lastLoss = questionIndex;
        result.hearts = life.hearts;
        result.lostHeart = true;
        if (life.hearts === 0) {
          life.eliminatedAt = questionIndex;
          result.eliminated = true;
        }
      }
      if (life.hearts === 0) result.ghost = true;
      life.result = result;
    }
  }

  /** « ✅ Accepter » (T44): every life before the reveal's settlement. */
  snapshot(): SurvivalSnapshot {
    return new Map([...this.lives].map(([id, life]) => [id, { ...life }]));
  }

  /**
   * Back to the lives before the settlement, to settle the question again. Haunts spent since
   * the reveal stay spent (the Gel / Brouilleur already sits on its target).
   */
  restore(snapshot: SurvivalSnapshot): void {
    for (const [id, saved] of snapshot) {
      const now = this.lives.get(id);
      const earned = now?.result?.hauntEarned ? 1 : 0;
      const spent = now ? Math.max(0, saved.haunts + earned - now.haunts) : 0;
      this.lives.set(id, { ...saved, haunts: Math.max(0, saved.haunts - spent) });
    }
  }

  /** New question: the last result is over. */
  startQuestion(): void {
    for (const life of this.lives.values()) life.result = null;
  }

  /** `player:result.survival`. */
  resultFields(playerId: string): PlayerResultPayload['survival'] {
    const life = this.life(playerId);
    return life.result ?? { hearts: life.hearts, lostHeart: false, ...ghostFlag(life) };
  }

  /** At most one player left alive (nobody, for a game started alone): straight to the podium. */
  finished(): boolean {
    if (this.startCount === 0) return false;
    let alive = 0;
    for (const id of this.ctx.players().keys()) if (!this.isGhost(id)) alive++;
    return this.startCount >= 2 ? alive <= 1 : alive === 0;
  }

  /**
   * Survivor ranking with competition ranks: the living first, then the ghosts eliminated last;
   * ties (same group) by points, then nickname for a stable order.
   */
  rank<T extends Player>(players: Iterable<T>): { player: T; rank: number }[] {
    // Living players count as eliminated "after the end".
    const survivedUntil = (p: T) => this.life(p.id).eliminatedAt ?? Infinity;
    const sorted = [...players].sort(
      (a, b) =>
        survivedUntil(b) - survivedUntil(a) ||
        b.totalScore - a.totalScore ||
        a.nickname.localeCompare(b.nickname),
    );
    const ranked: { player: T; rank: number }[] = [];
    sorted.forEach((player, i) => {
      const prev = ranked[i - 1];
      const tied =
        prev &&
        survivedUntil(prev.player) === survivedUntil(player) &&
        prev.player.totalScore === player.totalScore;
      ranked.push({ player, rank: tied ? prev.rank : i + 1 });
    });
    return ranked;
  }

  /** Leaderboard / podium / saved results: hearts left and elimination. */
  info(playerId: string): NonNullable<RankedPlayer['survival']> {
    const life = this.life(playerId);
    return {
      hearts: life.hearts,
      ...(life.eliminatedAt !== null && { eliminatedAt: life.eliminatedAt }),
    };
  }

  // ---------- Haunting ----------

  /** A ghost spends a haunt: a free Gel / Brouilleur on a living player's next question. */
  haunt(ghost: Player, haunt: HauntType, targetId: string): void {
    const phase = this.ctx.phase();
    if (phase === 'LOBBY' || phase === 'PODIUM' || phase === 'ENDED')
      throw refuse('Pas de hantise en ce moment');
    if (this.ctx.paused()) throw new GameError('GAME_PAUSED', 'Partie en pause');
    const life = this.life(ghost.id);
    if (life.hearts > 0) throw refuse('Seuls les fantômes peuvent hanter');
    if (life.haunts === 0) throw refuse('Réponds juste pour pouvoir hanter un vivant');
    const target = this.ctx.players().get(targetId);
    if (!target || target.id === ghost.id) throw refuse('Choisis un joueur vivant');
    if (this.isGhost(target.id)) throw refuse(`${target.nickname} est déjà un fantôme`);
    this.ctx.jokers.haunt(ghost, haunt, target);
    life.haunts--;
    this.send();
  }

  // ---------- Payloads ----------

  statePayload(): SurvivalStatePayload {
    const players: SurvivalPlayer[] = [...this.ctx.players().values()].map((p) => {
      const life = this.life(p.id);
      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        hearts: life.hearts,
        ...(life.eliminatedAt !== null && { eliminatedAt: life.eliminatedAt }),
        ...(life.lastLoss !== null && { lastLoss: life.lastLoss }),
        ...(life.haunts > 0 && { haunts: life.haunts }),
      };
    });
    return { hearts: this.hearts, players, ...(this.finished() && { finished: true as const }) };
  }

  /** `survival:state` to everyone by default. */
  send(send: GameTransport['toAll'] = this.ctx.transport.toAll.bind(this.ctx.transport)): void {
    send('survival:state', this.statePayload());
  }
}

const ghostFlag = (life: Life) => (life.hearts === 0 ? { ghost: true as const } : {});
