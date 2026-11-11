import {
  COPY_DELAY_MS,
  DOUBLE_PENALTY,
  FREEZE_MS,
  JOKER_STREAK_STEP,
  JOKER_TYPES,
  JOKERS,
  JOKERS_AT_START,
  JOKERS_MAX,
  THIEF_SHARE,
  jokerAvailability,
  jokerRefusal,
  listItemLabel,
  type AnswerInput,
  type GameMode,
  type GamePhase,
  type HauntType,
  type JokerEffects,
  type JokerResult,
  type JokerType,
  type LobbyMember,
  type PlayerJokersPayload,
  type Question,
  type ServerToClientEvents,
  type ThiefWheel,
} from '@lbq/shared';
import { GameError } from './errors.js';
import type { GameTransport, Player } from './Game.js';

type Send = GameTransport['toAll'];
type ServerEvent = keyof ServerToClientEvents;

/** What the joker engine needs from its `Game` (hooks, see `Game.ts`). */
export interface JokerContext {
  readonly mode: GameMode;
  phase(): GamePhase;
  questionIndex(): number;
  question(): Question | undefined;
  paused(): boolean;
  players(): ReadonlyMap<string, Player>;
  /** Time since ANSWERING started, pauses excluded (0 during QUESTION_INTRO). */
  elapsedMs(): number;
  /** Records an answer for a player as if they had sent it (Copieur). */
  recordAnswer(player: Player, given: AnswerInput, responseMs: number): void;
  /**
   * Judges a recorded answer again with the current jokers (Sablier played after answering).
   * Returns the Sablier's extra points.
   */
  rescore(player: Player, given: AnswerInput): number;
  /**
   * « Mytho ! » vote: option indexes of the lies this player didn't write (null while the lies
   * are still being written).
   */
  bluffLies?(playerId: string): number[] | null;
  /** « Couleurs perdues »: still memorizing (stage 1) — answers come in stage 2. */
  memorizing?(): boolean;
  /** « Couleurs perdues » 50/50: half of the zones with their right color. */
  colorHints?(): { zone: number; color: number }[] | null;
  transport: GameTransport;
}

/** One player's jokers. Kept after a kick (reports list the jokers they used). */
interface JokerHand {
  hand: JokerType[];
  /** Every joker played, in order (saved in the report). */
  used: JokerType[];
  /** An armed Bouclier: blocks the next attack. */
  shield: boolean;
  /** « Survie » haunts waiting for the player's next question (that they can hit). */
  pendingFreeze: LobbyMember | null;
  pendingScramble: LobbyMember | null;
  // ---- current question ----
  played: { joker: JokerType; targetId?: string } | null;
  effects: JokerEffects;
  /** Gel on this question: answers refused before this elapsed time. */
  frozenMs: number;
  /** Copieur: whom this player copies on the current question. */
  copyTargetId: string | null;
  /** The answer given (Copieur reads the target's). */
  given: AnswerInput | null;
  /** Sablier: extra points of the answer. */
  hourglassExtra: number;
  results: JokerResult[];
}

/** `Jokers.snapshot()`: per player, the fields a reveal's settlement changes. */
export type JokerSnapshot = Map<
  string,
  { hand: JokerType[]; results: JokerResult[]; hourglassExtra: number; shield: boolean }
>;

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

const refuse = (message: string) => new GameError('JOKER_REFUSED', message);

/** Leading French article ignored for the 50/50 first letter (« Le Pacifique » → P). */
const ARTICLE = /^(?:l['’]\s*|(?:le|la|les|un|une|des)\s+)/i;

/**
 * Jokers of one game (PLAN.md §3 "Jokers"): hands, playing a joker, its effects, and the
 * scoring hooks the game calls at the right moments. Server-authoritative: each phone only gets
 * its own effects (`joker:state`).
 */
export class Jokers {
  private readonly hands = new Map<string, JokerHand>();
  /** Players attacked on the current question (one attack per target per question). */
  private readonly attacked = new Set<string>();
  /** Voleur (T51): players who played it on the current question, in the order played. */
  private thieves: string[] = [];
  /** Voleur wheels of the current question's settlement (T51). */
  private wheels: ThiefWheel[] = [];

  constructor(
    private readonly ctx: JokerContext,
    private readonly random: () => number = Math.random,
    /** Fixed starting hand for everyone instead of a random one (e2e tests). */
    private readonly startHand?: JokerType[],
    /**
     * false: « Survie » game without the Jokers option — nobody gets jokers, the engine only
     * carries the ghosts' haunts (Gel / Brouilleur effects).
     */
    private readonly withHands = true,
  ) {}

  // ---------- Game hooks ----------

  /** Start of the game: JOKERS_AT_START different random jokers each. */
  deal(): void {
    for (const p of this.ctx.players().values()) {
      if (!this.withHands) {
        this.hands.set(p.id, newHand([]));
        continue;
      }
      if (this.startHand) {
        this.hands.set(p.id, newHand(this.startHand.slice(0, JOKERS_MAX)));
        continue;
      }
      const pool = [...JOKER_TYPES];
      const hand: JokerType[] = [];
      while (hand.length < JOKERS_AT_START && pool.length > 0)
        hand.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]!);
      this.hands.set(p.id, newHand(hand));
    }
  }

  /** QUESTION_INTRO: per-question state reset, pending haunts land if the type allows it. */
  startQuestion(): void {
    this.attacked.clear();
    this.thieves = [];
    this.wheels = [];
    const q = this.ctx.question();
    const availability = q ? jokerAvailability(q.type, q.buzzer) : null;
    for (const h of this.hands.values()) {
      h.played = null;
      h.effects = {};
      h.frozenMs = 0;
      h.copyTargetId = null;
      h.given = null;
      h.hourglassExtra = 0;
      h.results = [];
      // « Buzzer »: no joker, but a pending Gel still lands (it delays the BUZZ).
      if (!q || !availability || !(availability.jokers || availability.freeze)) continue;
      if (h.pendingFreeze) {
        h.frozenMs = FREEZE_MS;
        h.effects.frozen = { ms: FREEZE_MS, by: h.pendingFreeze };
        h.pendingFreeze = null;
      }
      if (h.pendingScramble && availability.scramble && 'choices' in q) {
        h.effects.scrambled = {
          by: h.pendingScramble,
          choices: this.shuffled(q.choices.map((c, index) => ({ index, text: c.text }))),
        };
        h.pendingScramble = null;
      }
    }
    this.sendStates();
  }

  /** Before an answer is accepted: Gel, Copieur. */
  checkAnswer(player: Player, responseMs: number): void {
    const h = this.hands.get(player.id);
    if (!h) return;
    if (h.copyTargetId)
      throw new GameError('ALREADY_ANSWERED', 'Tu copies la réponse d’un autre joueur');
    if (responseMs < h.frozenMs) {
      const left = Math.ceil((h.frozenMs - responseMs) / 1000);
      throw new GameError('FROZEN', `Gelé ! Encore ${left} s`);
    }
  }

  /** Response time used for the speed points (Sablier: half). */
  scoringMs(playerId: string, responseMs: number): number {
    return this.hands.get(playerId)?.played?.joker === 'hourglass' ? responseMs / 2 : responseMs;
  }

  /** An answer was recorded: the players copying this one answer the same. */
  onAnswered(player: Player, given: AnswerInput, hourglassExtra: number): void {
    const h = this.hands.get(player.id);
    if (h) {
      h.given = given;
      h.hourglassExtra = hourglassExtra;
    }
    const responseMs = player.answer?.responseMs ?? 0;
    for (const [id, copier] of this.hands) {
      if (copier.copyTargetId !== player.id) continue;
      const p = this.ctx.players().get(id);
      if (!p || p.answer) continue;
      this.copyNow(p, copier, given, responseMs);
    }
    // Who answered changed: the phones' Gel / Brouilleur target lists (T42).
    if (this.withHands) this.sendStates();
  }

  /**
   * « Annuler ma réponse » (T43): the player's answer was removed. Returns the copiers whose copy
   * of it must go too (they copy again when the player answers again). Jokers already played stay.
   */
  onUnanswered(player: Player): Player[] {
    const h = this.hands.get(player.id);
    if (h) {
      h.given = null;
      h.hourglassExtra = 0;
    }
    const copiers: Player[] = [];
    for (const [id, copier] of this.hands) {
      const p = this.ctx.players().get(id);
      if (copier.copyTargetId !== player.id || !p?.answer) continue;
      delete copier.effects.copied;
      copiers.push(p);
    }
    return copiers;
  }

  /** Copieur: the player waits for this target (undefined = not copying, null = target gone). */
  copyTargetOf(playerId: string): Player | null | undefined {
    const id = this.hands.get(playerId)?.copyTargetId;
    if (!id) return undefined;
    return this.ctx.players().get(id) ?? null;
  }

  /** Bouclier played on this question: a wrong answer keeps the streak. */
  savesStreak(playerId: string): boolean {
    return this.hands.get(playerId)?.played?.joker === 'shield';
  }

  /**
   * REVEAL, per player, once the question points (streak bonus included) are known: Double ou
   * rien. Returns the points earned (may be negative; the score never goes below 0).
   */
  adjustPoints(player: Player, correct: boolean, pointsEarned: number): number {
    const h = this.hands.get(player.id);
    if (!h?.played) return pointsEarned;
    const { joker } = h.played;
    if (joker === 'double') {
      if (correct) {
        h.results.push({ kind: 'double', points: pointsEarned });
        return pointsEarned * 2;
      }
      const lost = Math.min(DOUBLE_PENALTY, player.totalScore + pointsEarned);
      h.results.push({ kind: 'doubleLost', points: lost });
      return pointsEarned - lost;
    }
    if (joker === 'shield' && !correct && player.answer) h.results.push({ kind: 'shieldSaved' });
    if (joker === 'hourglass' && correct && h.hourglassExtra > 0)
      h.results.push({ kind: 'hourglass', points: h.hourglassExtra });
    return pointsEarned;
  }

  /**
   * REVEAL, after every player is scored (before the team averages): Voleur steals, Copieur
   * notes, new jokers for the streaks (one every JOKER_STREAK_STEP correct answers in a row).
   */
  afterScoring(polled: boolean): void {
    const players = this.ctx.players();
    for (const [id, h] of this.hands) {
      const p = players.get(id);
      if (!p || !h.played) continue;
      const target = h.played.targetId ? players.get(h.played.targetId) : undefined;
      if (h.played.joker === 'copy' && target) {
        h.results.push({ kind: p.answer ? 'copied' : 'copyMissed', player: member(target) });
      }
    }
    this.spinWheels();
    if (polled || !this.withHands) return;
    for (const [id, h] of this.hands) {
      const p = players.get(id);
      if (!p?.answer?.correct || p.streak === 0 || p.streak % JOKER_STREAK_STEP !== 0) continue;
      if (h.hand.length >= JOKERS_MAX) continue;
      const joker = JOKER_TYPES[Math.floor(this.random() * JOKER_TYPES.length)]!;
      h.hand.push(joker);
      h.results.push({ kind: 'earned', joker });
    }
    this.sendStates();
  }

  /**
   * Voleur (T51): one wheel per thief of this question, in the order they were played, among
   * every player of the game (the thief included). Another player loses
   * `THIEF_SHARE` of their total to the thief; the thief drawn loses it; a Bouclier of the drawn
   * player blocks it. Draws come from the settlement's random source (a T44 re-settlement draws
   * the same players).
   */
  private spinWheels(): void {
    this.wheels = [];
    const players = this.ctx.players();
    const candidates = [...players.values()];
    for (const thiefId of this.thieves) {
      const thief = players.get(thiefId);
      const h = this.hands.get(thiefId);
      if (!thief || !h || candidates.length === 0) continue;
      const drawn = candidates[Math.floor(this.random() * candidates.length)]!;
      const dh = this.hands.get(drawn.id);
      const wheel: ThiefWheel = {
        thief: member(thief),
        candidates: candidates.map(member),
        drawn: member(drawn),
        points: 0,
      };
      if (dh?.shield) {
        dh.shield = false;
        wheel.blocked = true;
        if (drawn !== thief) h.results.push({ kind: 'stealBlocked', player: member(drawn) });
        dh.results.push({ kind: 'wheelShielded', player: member(thief) });
      } else {
        const points = Math.round(Math.max(0, drawn.totalScore) * THIEF_SHARE);
        wheel.points = points;
        drawn.totalScore -= points;
        if (drawn.lastResult) drawn.lastResult.pointsEarned -= points;
        if (drawn === thief) {
          h.results.push({ kind: 'selfRobbed', points });
        } else {
          thief.totalScore += points;
          if (thief.lastResult) thief.lastResult.pointsEarned += points;
          h.results.push({ kind: 'stole', points, player: member(drawn) });
          dh?.results.push({ kind: 'stolen', points, player: member(thief) });
        }
      }
      this.wheels.push(wheel);
    }
  }

  /** `question:reveal.wheels` (T51): the Voleur wheels of this question, absent when none. */
  revealWheels(): ThiefWheel[] | undefined {
    return this.wheels.length > 0 ? this.wheels.map((w) => ({ ...w })) : undefined;
  }

  /** `player:result.jokers` (absent when nothing happened). */
  results(playerId: string): JokerResult[] | undefined {
    const r = this.hands.get(playerId)?.results;
    return r && r.length > 0 ? [...r] : undefined;
  }

  /** Leaderboard icons: the hand and the joker played on the last question. */
  leaderboardInfo(playerId: string): { hand: JokerType[]; used?: JokerType } | undefined {
    const h = this.hands.get(playerId);
    if (!h) return undefined;
    return { hand: [...h.hand], ...(h.played && { used: h.played.joker }) };
  }

  /** Replaces a player's hand (tests, demo setups). */
  setHand(playerId: string, hand: JokerType[]): void {
    const h = this.hands.get(playerId);
    if (h) h.hand = hand.slice(0, JOKERS_MAX);
    else this.hands.set(playerId, newHand(hand.slice(0, JOKERS_MAX)));
  }

  /**
   * « ✅ Accepter » (T44): what the reveal's settlement changes in the hands (jokers earned for a
   * streak, results, Sablier points), to score the question again from the same starting point.
   */
  snapshot(): JokerSnapshot {
    return new Map(
      [...this.hands].map(([id, h]) => [
        id,
        {
          hand: [...h.hand],
          results: [...h.results],
          hourglassExtra: h.hourglassExtra,
          shield: h.shield,
        },
      ]),
    );
  }

  restore(snapshot: JokerSnapshot): void {
    for (const [id, saved] of snapshot) {
      const h = this.hands.get(id);
      if (!h) continue;
      h.hand = [...saved.hand];
      h.results = [...saved.results];
      h.hourglassExtra = saved.hourglassExtra;
      h.shield = saved.shield;
    }
  }

  /** An answer was judged again (T44): the Sablier's extra points of the new judgement. */
  setHourglassExtra(playerId: string, extra: number): void {
    const h = this.hands.get(playerId);
    if (h) h.hourglassExtra = extra;
  }

  usedBy(playerId: string): JokerType[] {
    return [...(this.hands.get(playerId)?.used ?? [])];
  }

  /** A player was kicked: copiers of them stop waiting, the others' target lists change. */
  onKick(): void {
    this.sendStates();
  }

  // ---------- Playing a joker ----------

  use(player: Player, questionIndex: number, joker: JokerType, targetId?: string): void {
    const phase = this.ctx.phase();
    const q = this.ctx.question();
    if (
      (phase !== 'QUESTION_INTRO' && phase !== 'ANSWERING') ||
      questionIndex !== this.ctx.questionIndex() ||
      !q
    )
      throw refuse('Trop tard pour un joker');
    if (this.ctx.paused()) throw new GameError('GAME_PAUSED', 'Partie en pause');
    const h = this.hands.get(player.id);
    if (!h) throw refuse('Pas de jokers dans cette partie');
    if (h.played) throw refuse('Un seul joker par question');
    if (!h.hand.includes(joker)) throw refuse('Tu n’as pas ce joker');
    // After answering (T42): only the jokers that still make sense (not 50/50 nor Copieur).
    const why = jokerRefusal(q.type, joker, { buzzer: q.buzzer, answered: !!player.answer });
    if (why) throw refuse(why);

    const info = JOKERS[joker];
    let target: Player | undefined;
    if (info.target) {
      target = targetId ? this.ctx.players().get(targetId) : undefined;
      if (!target || target.id === player.id) throw refuse('Choisis un autre joueur');
      if (this.ctx.mode === 'teams') {
        const sameTeam = target.teamId === player.teamId;
        if (joker === 'copy' && !sameTeam) throw refuse('Tu ne peux copier que ton équipe');
        if (info.attack && sameTeam) throw refuse('Attaque une autre équipe !');
      }
      if (info.attack && this.attacked.has(target.id))
        throw refuse('Ce joueur a déjà été attaqué sur cette question');
      // Gel / Brouilleur hit this question: pointless on someone who already answered.
      if ((joker === 'freeze' || joker === 'scramble') && target.answer)
        throw refuse(`${target.nickname} a déjà répondu`);
    }
    // Computed before spending the joker: 50/50 may have nothing to hide.
    const fifty = joker === 'fifty' ? this.fiftyEffects(q, player.id) : null;

    h.hand.splice(h.hand.indexOf(joker), 1);
    h.used.push(joker);
    h.played = { joker, ...(target && { targetId: target.id }) };
    if (joker === 'thief') this.thieves.push(player.id);
    if (fifty) Object.assign(h.effects, fifty);

    let blocked = false;
    if (target && info.attack) {
      this.attacked.add(target.id);
      const th = this.hands.get(target.id);
      if (th?.shield) {
        th.shield = false;
        blocked = true;
      } else if (th && joker === 'freeze') this.freezeNow(target, th, member(player));
      else if (th && joker === 'scramble') this.scrambleNow(q, th, member(player));
    }
    if (joker === 'shield') h.shield = true;

    this.ctx.transport.toAll('joker:used', {
      questionIndex,
      joker,
      by: member(player),
      ...(target && joker !== 'copy' && { target: member(target) }),
      ...(blocked && { blocked: true as const }),
    });

    if (joker === 'copy' && target) {
      h.copyTargetId = target.id;
      const given = this.hands.get(target.id)?.given;
      if (target.answer && given) this.copyNow(player, h, given, target.answer.responseMs);
    }
    // Sablier played after answering: the recorded answer time counts half.
    if (joker === 'hourglass' && player.answer && h.given)
      h.hourglassExtra = this.ctx.rescore(player, h.given);
    this.sendStates();
  }

  /**
   * Gel on the current question (T42): answers refused for FREEZE_MS from the start of ANSWERING,
   * or from now when it lands during ANSWERING. « Mytho ! »: it blocks the vote (the lie can
   * still be written).
   */
  private freezeNow(target: Player, th: JokerHand, by: LobbyMember): void {
    const q = this.ctx.question();
    // « Couleurs perdues »: played while memorizing, it blocks the start of the answers.
    const writing =
      (q?.type === 'BLUFF' && this.ctx.bluffLies?.(target.id) == null) || !!this.ctx.memorizing?.();
    const from = this.ctx.phase() === 'ANSWERING' && !writing ? this.ctx.elapsedMs() : 0;
    th.frozenMs = Math.max(th.frozenMs, from + FREEZE_MS);
    th.effects.frozen = { ms: th.frozenMs, by };
  }

  /** Brouilleur on the current question (T42): the target's buttons move right away (T52). */
  private scrambleNow(q: Question, th: JokerHand, by: LobbyMember): void {
    if (!('choices' in q)) return;
    th.effects.scrambled = {
      by,
      choices: this.shuffled(q.choices.map((c, index) => ({ index, text: c.text }))),
    };
  }

  /**
   * « Survie »: a ghost's free Gel / Brouilleur on a living player. Lands on the target's next
   * question like the attack jokers (a Bouclier blocks it). One pending haunt of each kind per
   * target. Returns whether it was blocked.
   */
  haunt(by: Player, haunt: HauntType, target: Player): boolean {
    const th = this.hands.get(target.id);
    if (!th) throw refuse('Joueur introuvable');
    if (haunt === 'freeze' ? th.pendingFreeze : th.pendingScramble)
      throw refuse(
        `${target.nickname} est déjà ${haunt === 'freeze' ? 'gelé' : 'brouillé'} pour sa prochaine question`,
      );
    const blocked = th.shield;
    if (blocked) th.shield = false;
    else if (haunt === 'freeze') th.pendingFreeze = member(by);
    else th.pendingScramble = member(by);
    this.ctx.transport.toAll('joker:used', {
      questionIndex: Math.max(0, this.ctx.questionIndex()),
      joker: haunt,
      by: member(by),
      target: member(target),
      haunt: true,
      ...(blocked && { blocked: true as const }),
    });
    if (blocked) this.sendState(target);
    return blocked;
  }

  // ---------- Effects ----------

  private copyNow(player: Player, h: JokerHand, given: AnswerInput, targetMs: number): void {
    h.effects.copied = true;
    const responseMs = Math.max(targetMs + COPY_DELAY_MS, this.ctx.elapsedMs(), h.frozenMs);
    this.ctx.recordAnswer(player, given, responseMs);
    this.sendState(player);
  }

  /** 50/50 for the current question, or a refusal when it would do nothing. */
  private fiftyEffects(q: Question, playerId: string): JokerEffects {
    switch (q.type) {
      case 'BLUFF':
        // Played while the lies are being written: applied when the vote starts.
        return this.bluffFifty(playerId) ?? {};
      case 'MCQ':
      case 'TRUE_FALSE': {
        const wrong = q.choices.flatMap((c, i) => (c.isCorrect ? [] : [i]));
        const count = Math.min(Math.ceil(wrong.length / 2), wrong.length - 1);
        if (count <= 0) throw refuse('Le 50/50 ne sert à rien ici');
        return {
          hiddenChoices: this.shuffled(wrong)
            .slice(0, count)
            .sort((a, b) => a - b),
        };
      }
      case 'SLIDER': {
        const { min, max, step, correct } = q.slider;
        const positions = Math.round((max - min) / step);
        const span = Math.max(1, Math.floor(positions / 2));
        const at = Math.round((correct - min) / step);
        const lowest = Math.max(0, at - span);
        const highest = Math.min(at, positions - span);
        const low = lowest + Math.floor(this.random() * (highest - lowest + 1));
        const round = (v: number) => Number(v.toFixed(10));
        return {
          sliderRange: { min: round(min + low * step), max: round(min + (low + span) * step) },
        };
      }
      case 'COLORS': {
        const hints = this.ctx.colorHints?.();
        if (!hints?.length) throw refuse('Le 50/50 ne sert à rien ici');
        return { colorHints: hints };
      }
      case 'TYPE_ANSWER': {
        const answer = q.acceptedAnswers[0]!.trim().replace(ARTICLE, '');
        return { firstLetter: (answer[0] ?? '?').toLocaleUpperCase('fr') };
      }
      case 'POINTLESS': {
        // « Pas évident ! » (T60): the first letter of one item, drawn at random.
        const item = q.items[Math.floor(this.random() * q.items.length)]!;
        const answer = listItemLabel(item).replace(ARTICLE, '');
        return { firstLetter: (answer[0] ?? '?').toLocaleUpperCase('fr') };
      }
      default:
        throw refuse('Le 50/50 ne sert à rien ici');
    }
  }

  /** « Mytho ! » 50/50: half of the others' lies (always one left), null before the vote. */
  private bluffFifty(playerId: string): JokerEffects | null {
    const lies = this.ctx.bluffLies?.(playerId);
    if (!lies) return null;
    const count = Math.min(Math.ceil(lies.length / 2), lies.length - 1);
    if (count <= 0) return {};
    return {
      hiddenChoices: this.shuffled(lies)
        .slice(0, count)
        .sort((a, b) => a - b),
    };
  }

  /** « Mytho ! »: the vote starts, the 50/50 played while writing now hides lies. */
  onBluffVote(): void {
    for (const [id, h] of this.hands) {
      if (h.played?.joker !== 'fifty') continue;
      Object.assign(h.effects, this.bluffFifty(id) ?? {});
    }
    this.sendStates();
  }

  /** Random order, never the original one when there is a choice (Brouilleur). */
  private shuffled<T>(items: T[]): T[] {
    const out = [...items];
    for (let tries = 0; tries < 5; tries++) {
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      if (out.length < 2 || out.some((x, i) => x !== items[i])) return out;
    }
    return [...items.slice(1), items[0]!];
  }

  // ---------- Payloads ----------

  statePayload(player: Player): PlayerJokersPayload | null {
    const h = this.hands.get(player.id);
    if (!h) return null;
    const players = this.ctx.players();
    const target = h.played?.targetId ? players.get(h.played.targetId) : undefined;
    const type = this.ctx.question()?.type;
    return {
      questionIndex: this.ctx.questionIndex(),
      ...(type && { questionType: type }),
      ...(this.ctx.question()?.buzzer && { buzzer: true as const }),
      hand: [...h.hand],
      ...(h.played && {
        played: { joker: h.played.joker, ...(target && { target: member(target) }) },
      }),
      ...(h.shield && { shield: true as const }),
      others: [...players.values()]
        .filter((p) => p.id !== player.id)
        .map((p) => ({ ...member(p), ...(p.teamId !== null && { teamId: p.teamId }) })),
      attacked: [...this.attacked],
      answered: [...players.values()].filter((p) => p.answer).map((p) => p.id),
      effects: { ...h.effects },
    };
  }

  /** `joker:state` to one player (resync) or, by default, to every connected player. */
  sendState(player: Player, send?: Send): void {
    const payload = this.statePayload(player);
    if (!payload || !player.socketId) return;
    const sid = player.socketId;
    const emit: Send =
      send ??
      (<E extends ServerEvent>(event: E, ...args: Parameters<ServerToClientEvents[E]>) =>
        this.ctx.transport.toSocket(sid, event, ...args));
    emit('joker:state', payload);
  }

  sendStates(): void {
    for (const p of this.ctx.players().values()) this.sendState(p);
  }
}

function newHand(hand: JokerType[]): JokerHand {
  return {
    hand,
    used: [],
    shield: false,
    pendingFreeze: null,
    pendingScramble: null,
    played: null,
    effects: {},
    frozenMs: 0,
    copyTargetId: null,
    given: null,
    hourglassExtra: 0,
    results: [],
  };
}

/**
 * `E2E_JOKER_HAND=freeze,copy,double`: every player starts with this hand (e2e tests need known
 * jokers). Ignored in production and when it lists an unknown joker.
 */
export function e2eJokerHand(env: Record<string, string | undefined>): JokerType[] | undefined {
  const raw = env.E2E_JOKER_HAND;
  if (!raw || env.NODE_ENV === 'production') return undefined;
  const ids = raw.split(',').map((id) => id.trim());
  return ids.every((id): id is JokerType => (JOKER_TYPES as readonly string[]).includes(id))
    ? ids
    : undefined;
}
