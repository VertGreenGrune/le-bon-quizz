import { randomUUID } from 'node:crypto';
import {
  LEADERBOARD_SIZE,
  MAX_PLAYERS_PER_GAME,
  PODIUM_SIZE,
  QUESTION_INTRO_MS,
  type GamePhase,
  type GameStatePayload,
  type Question,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { GameError } from './errors.js';
import { computePoints, rankPlayers, streakBonus, topPlayers } from './scoring.js';

type ServerEvent = keyof ServerToClientEvents;
type EventArgs<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>;

/**
 * How a game talks to the outside world. Implemented with Socket.IO rooms in
 * `socket/index.ts`, and with a recorder in tests.
 */
export interface GameTransport {
  /** Everyone in the game (host + players). */
  toAll<E extends ServerEvent>(event: E, ...args: EventArgs<E>): void;
  /** Host sockets only. */
  toHost<E extends ServerEvent>(event: E, ...args: EventArgs<E>): void;
  /** One socket (a player). */
  toSocket<E extends ServerEvent>(socketId: string, event: E, ...args: EventArgs<E>): void;
  /** Removes a socket from the game's rooms (kick). */
  detachSocket(socketId: string): void;
}

/** Sends one event to some audience (host room, one socket…). */
type Send = GameTransport['toAll'];

export interface Player {
  id: string;
  sessionToken: string;
  nickname: string;
  /** `null` while disconnected — the player can come back with `player:rejoin`. */
  socketId: string | null;
  totalScore: number;
  correctCount: number;
  /** Consecutive correct answers up to the last revealed question (0 after a wrong / no answer). */
  streak: number;
  /** Answer to the current question, if any. Reset at each QUESTION_INTRO. */
  answer: { choiceIndex: number; responseMs: number; correct: boolean; points: number } | null;
  /** Result of the last revealed question, re-sent on rejoin during REVEAL. */
  lastResult: { correct: boolean; pointsEarned: number; streakBonus: number } | null;
}

/** Final standing of one player (kicked ones included), as saved in `PlayerResult`. */
export interface PlayerStanding {
  nickname: string;
  score: number;
  correctCount: number;
  rank: number;
}

export interface GameHooks {
  /** Called once when the game enters ENDED (e.g. to save the results). */
  onEnded?(game: Game): void;
}

/**
 * One live game, fully server-authoritative (PLAN.md §2–§3).
 *
 * LOBBY → QUESTION_INTRO → ANSWERING → REVEAL → LEADERBOARD → (next question | PODIUM) → ENDED
 *
 * QUESTION_INTRO ends by itself after QUESTION_INTRO_MS and ANSWERING when the timer expires or
 * every connected player has answered; the host may also skip both with `next()`.
 */
export class Game {
  readonly hostToken = randomUUID();
  readonly players = new Map<string, Player>();
  phase: GamePhase = 'LOBBY';
  questionIndex = -1;
  lastActivityAt = Date.now();
  /** When the first question started; null while in LOBBY. */
  startedAt: Date | null = null;
  /** Since when no host socket is connected; null while one is. */
  hostGoneSince: number | null = null;

  /** Players kicked after the start: out of the game, but kept in the saved results. */
  private readonly kicked: Player[] = [];
  private readonly hostSockets = new Set<string>();
  /** Reveal of the current question, re-sent to a host that rejoins. */
  private reveal: QuestionRevealPayload | null = null;
  private phaseEndsAt: number | null = null;
  private answeringStartedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly pin: string,
    readonly quiz: Quiz,
    private readonly transport: GameTransport,
    private readonly hooks: GameHooks = {},
  ) {}

  get totalQuestions(): number {
    return this.quiz.questions.length;
  }

  get currentQuestion(): Question | undefined {
    return this.quiz.questions[this.questionIndex];
  }

  // ---------- Host actions ----------

  assertHost(hostToken: string): void {
    if (hostToken !== this.hostToken) throw new GameError('UNAUTHORIZED', 'Invalid host token');
  }

  start(): void {
    if (this.phase !== 'LOBBY') throw new GameError('GAME_ALREADY_STARTED', 'Game already started');
    this.touch();
    this.enterQuestionIntro(0);
  }

  /** Advances to the next phase (host-driven). */
  next(): void {
    this.touch();
    switch (this.phase) {
      case 'LOBBY':
        return this.enterQuestionIntro(0);
      case 'QUESTION_INTRO':
        return this.enterAnswering();
      case 'ANSWERING':
        return this.enterReveal();
      case 'REVEAL':
        return this.enterLeaderboard();
      case 'LEADERBOARD':
        return this.questionIndex + 1 < this.totalQuestions
          ? this.enterQuestionIntro(this.questionIndex + 1)
          : this.enterPodium();
      case 'PODIUM':
        return this.end();
      case 'ENDED':
        return;
    }
  }

  end(): void {
    if (this.phase === 'ENDED') return;
    this.touch();
    this.setPhase('ENDED', null);
    this.broadcastState();
    this.hooks.onEnded?.(this);
  }

  kick(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return; // idempotent
    this.touch();
    this.players.delete(playerId);
    if (this.phase !== 'LOBBY') this.kicked.push(player);
    if (player.socketId) {
      this.transport.toSocket(player.socketId, 'player:kicked', {});
      this.transport.detachSocket(player.socketId);
      player.socketId = null;
    }
    this.sendLobbyPlayers();
    if (this.phase === 'ANSWERING') this.onAnswersChanged();
  }

  /** A host socket joined the game's rooms (create / rejoin / any host action). */
  hostConnected(socketId: string): void {
    this.hostSockets.add(socketId);
    this.hostGoneSince = null;
  }

  hostDisconnected(socketId: string): void {
    if (!this.hostSockets.delete(socketId)) return;
    if (this.hostSockets.size === 0) this.hostGoneSince = Date.now();
  }

  /**
   * Sends everything the host screen needs for the current phase to one host socket
   * (`host:rejoin`), in the order the host reducer expects: state first.
   */
  resyncHost(socketId: string): void {
    const send: Send = (event, ...args) => this.transport.toSocket(socketId, event, ...args);
    send('game:state', this.statePayload());
    this.sendLobbyPlayers(send);
    const phase = this.phase;
    if (this.currentQuestion && phase !== 'PODIUM' && phase !== 'ENDED')
      send('question:show', this.showPayload());
    if (phase === 'ANSWERING' || phase === 'REVEAL') this.sendAnswerCount(send);
    if (phase === 'REVEAL' && this.reveal) send('question:reveal', this.reveal);
    if (phase === 'LEADERBOARD')
      send('leaderboard', { top: topPlayers(this.players.values(), LEADERBOARD_SIZE) });
    if (phase === 'PODIUM' || phase === 'ENDED')
      send('podium', { top: topPlayers(this.players.values(), PODIUM_SIZE) });
  }

  // ---------- Player actions ----------

  join(nickname: string, socketId: string): Player {
    if (this.phase !== 'LOBBY')
      throw new GameError('GAME_ALREADY_STARTED', 'La partie a déjà commencé');
    if (this.players.size >= MAX_PLAYERS_PER_GAME)
      throw new GameError('GAME_FULL', 'La partie est complète');
    const name = nickname.trim();
    const key = name.toLocaleLowerCase();
    for (const p of this.players.values()) {
      if (p.nickname.toLocaleLowerCase() === key)
        throw new GameError('NICKNAME_TAKEN', 'Ce pseudo est déjà pris');
    }
    const player: Player = {
      id: randomUUID(),
      sessionToken: randomUUID(),
      nickname: name,
      socketId,
      totalScore: 0,
      correctCount: 0,
      streak: 0,
      answer: null,
      lastResult: null,
    };
    this.touch();
    this.players.set(player.id, player);
    this.sendLobbyPlayers();
    return player;
  }

  /**
   * Re-attaches a player to a new socket, then re-sends what the phone needs for the current
   * phase. The caller must send the ack *before* calling `resync()`.
   */
  rejoin(sessionToken: string, socketId: string): Player {
    const player = this.findBySession(sessionToken);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Session introuvable');
    if (player.socketId && player.socketId !== socketId)
      this.transport.detachSocket(player.socketId);
    player.socketId = socketId;
    this.touch();
    if (this.phase === 'ANSWERING') this.sendAnswerCount();
    return player;
  }

  /**
   * Sends the current state (+ phase-specific payload) to one player, after join/rejoin.
   * Beyond PLAN.md §4: `question:prompt` is only re-sent if the player has not
   * answered yet; during REVEAL / PODIUM their `player:result` / `podium` is re-sent too.
   */
  resync(player: Player): void {
    if (!player.socketId) return;
    const sid = player.socketId;
    this.transport.toSocket(sid, 'game:state', this.statePayload());
    if (this.phase === 'ANSWERING' && !player.answer) {
      this.transport.toSocket(sid, 'question:prompt', this.promptPayload());
    } else if (this.phase === 'REVEAL' && player.lastResult) {
      this.transport.toSocket(sid, 'player:result', this.resultPayload(player));
    } else if (this.phase === 'PODIUM') {
      this.transport.toSocket(sid, 'podium', {
        top: topPlayers(this.players.values(), PODIUM_SIZE),
      });
    }
  }

  disconnect(socketId: string): void {
    for (const player of this.players.values()) {
      if (player.socketId !== socketId) continue;
      player.socketId = null;
      if (this.phase === 'ANSWERING') this.onAnswersChanged();
    }
  }

  answer(playerId: string, questionIndex: number, choiceIndex: number): void {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    const question = this.currentQuestion;
    if (this.phase !== 'ANSWERING' || questionIndex !== this.questionIndex || !question)
      throw new GameError('NOT_ANSWERING', 'Trop tard !');
    if (player.answer) throw new GameError('ALREADY_ANSWERED', 'Réponse déjà envoyée');
    const choice = question.choices[choiceIndex];
    if (!choice) throw new GameError('INVALID_PAYLOAD', 'Choix invalide');

    const responseMs = Date.now() - this.answeringStartedAt;
    const correct = choice.isCorrect;
    const points = correct
      ? computePoints(question.basePoints, responseMs, question.timeLimitSec * 1000)
      : 0;
    player.answer = { choiceIndex, responseMs, correct, points };
    this.touch();
    this.onAnswersChanged();
  }

  // ---------- Queries ----------

  findBySession(sessionToken: string): Player | undefined {
    for (const p of this.players.values()) if (p.sessionToken === sessionToken) return p;
    return undefined;
  }

  /**
   * Final ranking: the remaining players (same order as the podium), then the players kicked
   * after the start, ranked among themselves below them.
   */
  standings(): PlayerStanding[] {
    const standing =
      (offset: number) =>
      ({ player, rank }: { player: Player; rank: number }) => ({
        nickname: player.nickname,
        score: player.totalScore,
        correctCount: player.correctCount,
        rank: rank + offset,
      });
    return [
      ...rankPlayers(this.players.values()).map(standing(0)),
      ...rankPlayers(this.kicked).map(standing(this.players.size)),
    ];
  }

  statePayload(): GameStatePayload {
    const state: GameStatePayload = {
      phase: this.phase,
      questionIndex: this.questionIndex,
      totalQuestions: this.totalQuestions,
    };
    if (this.phaseEndsAt !== null) state.remainingMs = Math.max(0, this.phaseEndsAt - Date.now());
    return state;
  }

  /** Clears pending timers. Call before dropping the game. */
  dispose(): void {
    this.clearTimer();
  }

  // ---------- Transitions ----------

  private enterQuestionIntro(index: number): void {
    const question = this.quiz.questions[index];
    if (!question) return this.enterPodium();
    this.startedAt ??= new Date();
    this.questionIndex = index;
    this.reveal = null;
    for (const p of this.players.values()) {
      p.answer = null;
      p.lastResult = null;
    }
    this.setPhase('QUESTION_INTRO', QUESTION_INTRO_MS);
    this.broadcastState();
    this.transport.toHost('question:show', this.showPayload());
    this.timer = setTimeout(() => this.enterAnswering(), QUESTION_INTRO_MS);
  }

  private enterAnswering(): void {
    const question = this.currentQuestion;
    if (!question) return;
    const limitMs = question.timeLimitSec * 1000;
    this.setPhase('ANSWERING', limitMs);
    this.answeringStartedAt = Date.now();
    this.broadcastState();
    const prompt = this.promptPayload();
    for (const p of this.players.values()) {
      if (p.socketId) this.transport.toSocket(p.socketId, 'question:prompt', prompt);
    }
    this.sendAnswerCount();
    this.timer = setTimeout(() => this.enterReveal(), limitMs);
    // Nobody connected to wait for → don't block on the timer.
    if (this.allConnectedAnswered()) this.enterReveal();
  }

  private enterReveal(): void {
    const question = this.currentQuestion;
    if (this.phase !== 'ANSWERING' || !question) return;
    this.setPhase('REVEAL', null);

    const distribution = question.choices.map(() => 0);
    for (const p of this.players.values()) {
      const a = p.answer;
      if (a) distribution[a.choiceIndex] = (distribution[a.choiceIndex] ?? 0) + 1;
      const correct = a?.correct ?? false;
      p.streak = correct ? p.streak + 1 : 0;
      // A 0-point question awards nothing, streak bonus included (the streak still counts).
      const bonus = correct && question.basePoints > 0 ? streakBonus(p.streak) : 0;
      const pointsEarned = (a?.points ?? 0) + bonus;
      p.totalScore += pointsEarned;
      if (correct) p.correctCount++;
      p.lastResult = { correct, pointsEarned, streakBonus: bonus };
    }

    this.broadcastState();
    this.reveal = {
      correctIndexes: question.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
      distribution,
    };
    this.transport.toHost('question:reveal', this.reveal);
    for (const p of this.players.values()) {
      if (p.socketId) this.transport.toSocket(p.socketId, 'player:result', this.resultPayload(p));
    }
  }

  private enterLeaderboard(): void {
    this.setPhase('LEADERBOARD', null);
    this.broadcastState();
    this.transport.toHost('leaderboard', {
      top: topPlayers(this.players.values(), LEADERBOARD_SIZE),
    });
  }

  private enterPodium(): void {
    this.setPhase('PODIUM', null);
    this.broadcastState();
    this.transport.toAll('podium', { top: topPlayers(this.players.values(), PODIUM_SIZE) });
  }

  // ---------- Helpers ----------

  private onAnswersChanged(): void {
    this.sendAnswerCount();
    if (this.allConnectedAnswered()) this.enterReveal();
  }

  private allConnectedAnswered(): boolean {
    for (const p of this.players.values()) if (p.socketId && !p.answer) return false;
    return true;
  }

  private sendAnswerCount(send: Send = this.transport.toHost.bind(this.transport)): void {
    let answered = 0;
    let total = 0;
    for (const p of this.players.values()) {
      if (p.answer) answered++;
      if (p.answer || p.socketId) total++;
    }
    send('answer:count', { answered, total });
  }

  private sendLobbyPlayers(send: Send = this.transport.toHost.bind(this.transport)): void {
    send('lobby:players', {
      players: [...this.players.values()].map((p) => ({ id: p.id, nickname: p.nickname })),
    });
  }

  private showPayload(): QuestionShowPayload {
    const q = this.currentQuestion!;
    return {
      index: this.questionIndex,
      text: q.text,
      ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
      choices: q.choices.map((c) => c.text),
      timeLimitSec: q.timeLimitSec,
    };
  }

  private promptPayload() {
    const q = this.currentQuestion!;
    return {
      index: this.questionIndex,
      choiceCount: q.choices.length,
      timeLimitSec: q.timeLimitSec,
    };
  }

  private resultPayload(player: Player) {
    const ranked = rankPlayers(this.players.values());
    const rank = ranked.find((r) => r.player === player)?.rank ?? ranked.length;
    return {
      correct: player.lastResult?.correct ?? false,
      pointsEarned: player.lastResult?.pointsEarned ?? 0,
      streak: player.streak,
      streakBonus: player.lastResult?.streakBonus ?? 0,
      totalScore: player.totalScore,
      rank,
    };
  }

  private broadcastState(): void {
    this.transport.toAll('game:state', this.statePayload());
  }

  private setPhase(phase: GamePhase, durationMs: number | null): void {
    this.clearTimer();
    this.phase = phase;
    this.phaseEndsAt = durationMs === null ? null : Date.now() + durationMs;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }
}
