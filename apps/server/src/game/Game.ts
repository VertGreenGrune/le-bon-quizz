import { randomUUID } from 'node:crypto';
import {
  DEFAULT_TEAM_COUNT,
  LEADERBOARD_SIZE,
  MAX_PLAYERS_PER_GAME,
  PAUSE_GRACE_MS,
  PODIUM_SIZE,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  TEAM_NAMES,
  TYPE_ANSWER_MAX_LENGTH,
  choiceTexts,
  correctChoiceIndexes,
  randomAvatarId,
  type AnswerInput,
  type AvatarId,
  type GameMode,
  type GamePause,
  type GamePhase,
  type GameStatePayload,
  type LobbyMember,
  type LobbyTeamsPayload,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type RevealDetails,
  type Quiz,
  type RankedTeam,
  type ServerToClientEvents,
  type SliderPrompt,
  type SliderSettings,
  type StandingsPayload,
  type TeamCount,
  type TeamId,
} from '@lbq/shared';
import { GameError } from './errors.js';
import { matchesAnswer, normalizeAnswer } from './matching.js';
import {
  computePoints,
  sliderPoints,
  rankPlayers,
  rankTeams,
  streakBonus,
  teamQuestionPoints,
  topPlayers,
} from './scoring.js';

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

/** A player's answer to the current question: one of choice / typed text / slider value. */
export interface Answer {
  choiceIndex: number | null;
  text: string | null;
  value: number | null;
  responseMs: number;
  correct: boolean;
  points: number;
}

/** Typed answers shown at the reveal (TYPE_ANSWER). */
const TOP_ANSWERS = 6;

export interface Player {
  id: string;
  sessionToken: string;
  nickname: string;
  avatar: AvatarId;
  /** `null` while disconnected — the player can come back with `player:rejoin`. */
  socketId: string | null;
  /** When the player lost the connection (null while connected): starts the pause grace. */
  offlineSince: number | null;
  totalScore: number;
  correctCount: number;
  /** Consecutive correct answers up to the last revealed question (0 after a wrong / no answer). */
  streak: number;
  /** Answer to the current question, if any. Reset at each QUESTION_INTRO. */
  answer: Answer | null;
  /** Result of the last revealed question, re-sent on rejoin during REVEAL. */
  lastResult: { correct: boolean; pointsEarned: number; streakBonus: number } | null;
  /** Team mode: chosen in the lobby (null until then). Always null in solo mode. */
  teamId: TeamId | null;
}

/** Final standing of one player (kicked ones included), as saved in `PlayerResult`. */
export interface PlayerStanding {
  nickname: string;
  avatar: AvatarId;
  score: number;
  correctCount: number;
  rank: number;
  teamId: TeamId | null;
}

/** Final standing of one team, as saved in `TeamResult`. */
export interface TeamStanding {
  teamId: TeamId;
  name: string;
  score: number;
  playerCount: number;
  rank: number;
}

/** How one revealed question went, as saved in `QuestionResult` (for the game report). */
export interface QuestionStats {
  index: number;
  type: Question['type'];
  text: string;
  choices: string[];
  correctIndexes: number[];
  distribution: number[];
  playerCount: number;
  correctCount: number;
  answerCount: number;
  details: RevealDetails;
}

/** A paused timed phase (QUESTION_INTRO / ANSWERING). */
interface Pause {
  /** When the pause started. */
  since: number;
  /** Moment the timer was frozen at: the first drop (the grace period is given back). */
  frozenAt: number;
  /** Time left in the phase at `frozenAt`. */
  remainingMs: number;
  /** Set during the 3-2-1 countdown before resuming. */
  resumeAt: number | null;
}

export interface GameSettings {
  mode: GameMode;
  /** Team mode: number of teams offered in the lobby (default 2). */
  teamCount?: TeamCount;
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
 * every player has answered; the host may also skip both with `next()`.
 *
 * Pause: during QUESTION_INTRO / ANSWERING, a player who still has to answer (or the host screen)
 * offline for more than PAUSE_GRACE_MS freezes the timer at its value when they dropped. Once
 * everyone is back (or the host continues without them), a 3-2-1 countdown resumes it.
 *
 * Team mode: players pick a team in the lobby; each player scores as in solo, and a team earns
 * per question the average of its present members' points (PLAN.md §3).
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
  /** One entry per revealed question, in play order. */
  readonly questionStats: QuestionStats[] = [];

  /** Players kicked after the start: out of the game, but kept in the saved results. */
  private readonly kicked: Player[] = [];
  private readonly hostSockets = new Set<string>();
  /** Reveal of the current question, re-sent to a host that rejoins. */
  private reveal: QuestionRevealPayload | null = null;
  private phaseEndsAt: number | null = null;
  private phaseStartedAt = 0;
  /** ANSWERING start, pushed forward by the paused time: `responseMs` excludes the pauses. */
  private answeringStartedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pause: Pause | null = null;
  /** Fires when the earliest offline awaited player's grace period ends. */
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Players the host continued without, for the current question only (absent, not awaited). */
  private readonly excused = new Set<string>();

  readonly mode: GameMode;
  /** Team mode: the teams offered in the lobby, then (from the start) the ones that have players. */
  private teamIds: TeamId[] = [];
  private readonly teamScores = new Map<TeamId, number>();
  /** Players connected when the current ANSWERING phase started (team averages). */
  private readonly presentIds = new Set<string>();

  constructor(
    readonly pin: string,
    readonly quiz: Quiz,
    private readonly transport: GameTransport,
    private readonly hooks: GameHooks = {},
    settings: GameSettings = { mode: 'solo' },
  ) {
    this.mode = settings.mode;
    if (this.mode === 'teams') {
      const count = settings.teamCount ?? DEFAULT_TEAM_COUNT;
      this.teamIds = ([0, 1, 2, 3] as const).slice(0, count);
      for (const id of this.teamIds) this.teamScores.set(id, 0);
    }
  }

  get totalQuestions(): number {
    return this.quiz.questions.length;
  }

  get currentQuestion(): Question | undefined {
    return this.quiz.questions[this.questionIndex];
  }

  get paused(): boolean {
    return this.pause !== null;
  }

  // ---------- Host actions ----------

  assertHost(hostToken: string): void {
    if (hostToken !== this.hostToken) throw new GameError('UNAUTHORIZED', 'Invalid host token');
  }

  start(): void {
    if (this.phase !== 'LOBBY') throw new GameError('GAME_ALREADY_STARTED', 'Game already started');
    if (this.mode === 'teams') this.startTeams();
    this.touch();
    this.enterQuestionIntro(0);
  }

  /** Advances to the next phase (host-driven). */
  next(): void {
    this.touch();
    switch (this.phase) {
      case 'LOBBY':
        return this.start();
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
    this.excused.delete(playerId);
    if (player.socketId) {
      this.transport.toSocket(player.socketId, 'player:kicked', {});
      this.transport.detachSocket(player.socketId);
      player.socketId = null;
    }
    this.sendLobbyPlayers();
    this.sendTeams();
    this.checkPause();
    if (this.phase === 'ANSWERING' && !this.pause) this.onAnswersChanged();
  }

  /**
   * « Continuer sans… »: the offline players the game waits for become absent for the current
   * question (they don't block it and, in team mode, don't count as present), then the game
   * resumes after the countdown. No-op when not paused.
   */
  resume(): void {
    if (!this.pause) return;
    this.touch();
    for (const p of this.awaitedOffline()) {
      this.excused.add(p.id);
      this.presentIds.delete(p.id);
    }
    if (this.phase === 'ANSWERING') this.sendAnswerCount();
    this.checkPause();
  }

  /** Team mode, LOBBY only: puts a player in a team (their own choice or the host's). */
  setTeam(playerId: string, teamId: TeamId): void {
    this.assertTeamLobby();
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    if (!this.teamIds.includes(teamId)) throw new GameError('INVALID_PAYLOAD', 'Équipe invalide');
    this.touch();
    if (player.teamId === teamId) return;
    player.teamId = teamId;
    this.sendLobbyPlayers();
    this.sendTeams();
  }

  /** Team mode, LOBBY only: random balanced teams (sizes differ by at most one). */
  shuffleTeams(random: () => number = Math.random): void {
    this.assertTeamLobby();
    const players = [...this.players.values()];
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [players[i], players[j]] = [players[j]!, players[i]!];
    }
    players.forEach((p, i) => (p.teamId = this.teamIds[i % this.teamIds.length]!));
    this.touch();
    this.sendLobbyPlayers();
    this.sendTeams();
  }

  /** A host socket joined the game's rooms (create / rejoin / any host action). */
  hostConnected(socketId: string): void {
    this.hostSockets.add(socketId);
    this.hostGoneSince = null;
    this.checkPause();
  }

  hostDisconnected(socketId: string): void {
    if (!this.hostSockets.delete(socketId)) return;
    if (this.hostSockets.size === 0) this.hostGoneSince = Date.now();
    this.checkPause();
  }

  /**
   * Sends everything the host screen needs for the current phase to one host socket
   * (`host:rejoin`), in the order the host reducer expects: state first.
   */
  resyncHost(socketId: string): void {
    const send: Send = (event, ...args) => this.transport.toSocket(socketId, event, ...args);
    send('game:state', this.statePayload());
    this.sendResuming(send);
    this.sendLobbyPlayers(send);
    this.sendTeams(send);
    const phase = this.phase;
    if (this.currentQuestion && phase !== 'PODIUM' && phase !== 'ENDED')
      send('question:show', this.showPayload());
    if (phase === 'ANSWERING' || phase === 'REVEAL') this.sendAnswerCount(send);
    if (phase === 'REVEAL' && this.reveal) send('question:reveal', this.reveal);
    if (phase === 'LEADERBOARD') send('leaderboard', this.standingsPayload(LEADERBOARD_SIZE));
    if (phase === 'PODIUM' || phase === 'ENDED') send('podium', this.standingsPayload(PODIUM_SIZE));
  }

  // ---------- Player actions ----------

  /** `avatar` missing (older clients) → a random one, not taken yet if possible. */
  join(nickname: string, socketId: string, avatar?: AvatarId): Player {
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
      avatar: avatar ?? randomAvatarId(this.takenAvatars()),
      socketId,
      offlineSince: null,
      totalScore: 0,
      correctCount: 0,
      streak: 0,
      answer: null,
      lastResult: null,
      teamId: null,
    };
    this.touch();
    this.players.set(player.id, player);
    this.sendLobbyPlayers();
    this.sendTeams();
    return player;
  }

  /**
   * Re-attaches a player to a new socket, then re-sends what the phone needs for the current
   * phase. The caller must send the ack *before* calling `resync()`.
   */
  rejoin(sessionToken: string, socketId: string): Player {
    const player = this.findBySession(sessionToken);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Session introuvable');
    return this.reattach(player, socketId);
  }

  /**
   * Started game, from another phone / a fresh browser: takes the place of the *disconnected*
   * player with this nickname (score, team, avatar, streak kept). Their old session token is
   * revoked, so the lost phone can't come back as a duplicate. Like `rejoin`, the caller sends
   * the ack then calls `resync()`.
   */
  reclaim(nickname: string, socketId: string): Player {
    const key = nickname.trim().toLocaleLowerCase();
    const player = [...this.players.values()].find((p) => p.nickname.toLocaleLowerCase() === key);
    if (this.phase === 'LOBBY' || this.phase === 'ENDED' || !player)
      throw new GameError('GAME_ALREADY_STARTED', 'La partie a déjà commencé');
    if (player.socketId)
      throw new GameError('NICKNAME_TAKEN', 'Ce joueur est encore connecté à la partie');
    player.sessionToken = randomUUID();
    return this.reattach(player, socketId);
  }

  private reattach(player: Player, socketId: string): Player {
    if (player.socketId && player.socketId !== socketId)
      this.transport.detachSocket(player.socketId);
    const wasOffline = player.socketId === null;
    player.socketId = socketId;
    player.offlineSince = null;
    this.touch();
    if (wasOffline) this.sendLobbyPlayers();
    if (this.phase === 'ANSWERING') this.sendAnswerCount();
    this.checkPause();
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
    const send: Send = (event, ...args) => this.transport.toSocket(sid, event, ...args);
    send('game:state', this.statePayload());
    this.sendResuming(send);
    this.sendTeams(send);
    if (this.phase === 'ANSWERING' && !player.answer) {
      this.transport.toSocket(sid, 'question:prompt', this.promptPayload());
    } else if (this.phase === 'REVEAL' && player.lastResult) {
      this.transport.toSocket(sid, 'player:result', this.resultPayload(player));
    } else if (this.phase === 'PODIUM') {
      this.transport.toSocket(sid, 'podium', this.standingsPayload(PODIUM_SIZE));
    }
  }

  disconnect(socketId: string): void {
    for (const player of this.players.values()) {
      if (player.socketId !== socketId) continue;
      player.socketId = null;
      player.offlineSince = Date.now();
      this.sendLobbyPlayers();
      if (this.phase === 'ANSWERING') this.sendAnswerCount();
      this.checkPause();
    }
  }

  /**
   * `input`: a choice index (shorthand for `{ choiceIndex }`), a typed text or a slider value;
   * it must match the question type (`INVALID_PAYLOAD` otherwise).
   */
  answer(playerId: string, questionIndex: number, input: number | AnswerInput): void {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    const question = this.currentQuestion;
    if (this.phase !== 'ANSWERING' || questionIndex !== this.questionIndex || !question)
      throw new GameError('NOT_ANSWERING', 'Trop tard !');
    if (player.answer) throw new GameError('ALREADY_ANSWERED', 'Réponse déjà envoyée');
    if (this.pause) throw new GameError('GAME_PAUSED', 'Partie en pause');

    const responseMs = Date.now() - this.answeringStartedAt;
    const timePoints = computePoints(question.basePoints, responseMs, question.timeLimitSec * 1000);
    const given = typeof input === 'number' ? { choiceIndex: input } : input;
    player.answer = { ...judgeAnswer(question, given, timePoints), responseMs };
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
        avatar: player.avatar,
        score: player.totalScore,
        correctCount: player.correctCount,
        rank: rank + offset,
        teamId: player.teamId,
      });
    return [
      ...rankPlayers(this.players.values()).map(standing(0)),
      ...rankPlayers(this.kicked).map(standing(this.players.size)),
    ];
  }

  /** Team mode: the teams in play, best first (empty in solo mode). */
  teamStandings(): TeamStanding[] {
    return rankTeams(this.rankedTeams()).map(({ team, rank }) => ({
      teamId: team.id,
      name: team.name,
      score: team.score,
      playerCount: team.playerCount,
      rank,
    }));
  }

  /** Avatars of the players in the game (several players may share one). */
  takenAvatars(): AvatarId[] {
    return [...new Set([...this.players.values()].map((p) => p.avatar))];
  }

  statePayload(): GameStatePayload {
    const state: GameStatePayload = {
      phase: this.phase,
      mode: this.mode,
      questionIndex: this.questionIndex,
      totalQuestions: this.totalQuestions,
    };
    if (this.pause) {
      state.remainingMs = this.pause.remainingMs;
      state.paused = this.pausePayload(this.pause);
    } else if (this.phaseEndsAt !== null) {
      state.remainingMs = Math.max(0, this.phaseEndsAt - Date.now());
    }
    return state;
  }

  /** Clears pending timers. Call before dropping the game. */
  dispose(): void {
    this.clearTimer();
    this.clearPause();
  }

  // ---------- Transitions ----------

  private enterQuestionIntro(index: number): void {
    const question = this.quiz.questions[index];
    if (!question) return this.enterPodium();
    this.startedAt ??= new Date();
    this.questionIndex = index;
    this.reveal = null;
    this.excused.clear();
    for (const p of this.players.values()) {
      p.answer = null;
      p.lastResult = null;
    }
    this.setPhase('QUESTION_INTRO', QUESTION_INTRO_MS);
    this.broadcastState();
    this.transport.toHost('question:show', this.showPayload());
    // Someone still offline from the previous phases: the question starts paused.
    this.checkPause({ immediate: true });
  }

  private enterAnswering(): void {
    const question = this.currentQuestion;
    if (!question) return;
    const limitMs = question.timeLimitSec * 1000;
    this.setPhase('ANSWERING', limitMs);
    this.answeringStartedAt = Date.now();
    this.presentIds.clear();
    for (const p of this.players.values()) if (p.socketId) this.presentIds.add(p.id);
    this.broadcastState();
    const prompt = this.promptPayload();
    for (const p of this.players.values()) {
      if (p.socketId) this.transport.toSocket(p.socketId, 'question:prompt', prompt);
    }
    this.sendAnswerCount();
    this.checkPause();
    // Nobody to wait for → don't block on the timer.
    if (!this.pause && this.allAnswered()) this.enterReveal();
  }

  private enterReveal(): void {
    const question = this.currentQuestion;
    if (this.phase !== 'ANSWERING' || !question) return;
    this.setPhase('REVEAL', null);

    const choices = choiceTexts(question);
    const distribution = choices.map(() => 0);
    // A poll has no right answer: 0 points, and the streak neither breaks nor grows.
    const poll = question.type === 'POLL';
    let correctCount = 0;
    let answerCount = 0;
    for (const p of this.players.values()) {
      const a = p.answer;
      if (a) answerCount++;
      if (a?.choiceIndex != null)
        distribution[a.choiceIndex] = (distribution[a.choiceIndex] ?? 0) + 1;
      const correct = a?.correct ?? false;
      if (!poll) p.streak = correct ? p.streak + 1 : 0;
      // A 0-point question awards nothing, streak bonus included (the streak still counts).
      const bonus = correct && question.basePoints > 0 ? streakBonus(p.streak) : 0;
      const pointsEarned = (a?.points ?? 0) + bonus;
      p.totalScore += pointsEarned;
      if (correct) {
        p.correctCount++;
        correctCount++;
      }
      p.lastResult = { correct, pointsEarned, streakBonus: bonus };
    }
    if (this.mode === 'teams') this.scoreTeams();
    const correctIndexes = correctChoiceIndexes(question);
    const details = this.revealDetails(question);
    this.questionStats.push({
      index: this.questionIndex,
      type: question.type,
      text: question.text,
      choices,
      correctIndexes,
      distribution,
      playerCount: this.players.size,
      correctCount,
      answerCount,
      details,
    });

    this.broadcastState();
    this.reveal = {
      type: question.type,
      correctIndexes,
      distribution,
      ...details,
      ...(details.slider && { correct: details.slider.correct, margin: details.slider.margin }),
    };
    this.transport.toHost('question:reveal', this.reveal);
    for (const p of this.players.values()) {
      if (p.socketId) this.transport.toSocket(p.socketId, 'player:result', this.resultPayload(p));
    }
  }

  /** TYPE_ANSWER: accepted + most typed answers; SLIDER: settings, guesses, closest guess. */
  private revealDetails(question: Question): RevealDetails {
    // Earliest answers first: the first typing names a group, the fastest wins a tie.
    const answers = [...this.players.values()]
      .flatMap((player) => (player.answer ? [{ player, answer: player.answer }] : []))
      .sort((a, b) => a.answer.responseMs - b.answer.responseMs);
    if (question.type === 'TYPE_ANSWER') {
      const groups = new Map<string, { text: string; count: number; correct: boolean }>();
      for (const { answer } of answers) {
        if (answer.text === null) continue;
        const key = normalizeAnswer(answer.text);
        const group = groups.get(key);
        if (group) group.count++;
        else groups.set(key, { text: answer.text, count: 1, correct: answer.correct });
      }
      return {
        acceptedAnswers: question.acceptedAnswers,
        topAnswers: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, TOP_ANSWERS),
      };
    }
    if (question.type === 'SLIDER') {
      const { slider } = question;
      const guesses = answers.flatMap(({ player, answer }) =>
        answer.value === null
          ? []
          : [{ nickname: player.nickname, value: answer.value, avatar: player.avatar }],
      );
      const distance = (g: { value: number }) => Math.abs(g.value - slider.correct);
      let closest: (typeof guesses)[number] | undefined;
      for (const g of guesses) if (!closest || distance(g) < distance(closest)) closest = g;
      return { slider, guesses: guesses.map((g) => g.value), ...(closest && { closest }) };
    }
    return {};
  }

  private enterLeaderboard(): void {
    this.setPhase('LEADERBOARD', null);
    this.broadcastState();
    this.transport.toHost('leaderboard', this.standingsPayload(LEADERBOARD_SIZE));
  }

  private enterPodium(): void {
    this.setPhase('PODIUM', null);
    this.broadcastState();
    this.transport.toAll('podium', this.standingsPayload(PODIUM_SIZE));
  }

  // ---------- Teams ----------

  private assertTeamLobby(): void {
    if (this.mode !== 'teams')
      throw new GameError('INVALID_PAYLOAD', 'Cette partie ne se joue pas en équipes');
    if (this.phase !== 'LOBBY')
      throw new GameError('GAME_ALREADY_STARTED', 'La partie a déjà commencé');
  }

  /** Checks the teams are ready, then keeps only the teams that have players. */
  private startTeams(): void {
    const players = [...this.players.values()];
    if (players.some((p) => p.teamId === null))
      throw new GameError('TEAMS_NOT_READY', 'Chaque joueur doit avoir une équipe');
    const used = this.teamIds.filter((id) => players.some((p) => p.teamId === id));
    if (used.length < 2)
      throw new GameError('TEAMS_NOT_READY', 'Il faut des joueurs dans au moins 2 équipes');
    this.teamIds = used;
    for (const id of this.teamScores.keys()) if (!used.includes(id)) this.teamScores.delete(id);
    this.sendTeams();
  }

  /**
   * Adds this question's points to each team: the average over its members who were connected
   * when ANSWERING started (or answered anyway). A player who drops mid-question still counts
   * (0 points); one absent for the whole question doesn't drag the team down.
   */
  private scoreTeams(): void {
    for (const id of this.teamIds) {
      const points: number[] = [];
      for (const p of this.players.values()) {
        if (p.teamId !== id || (!this.presentIds.has(p.id) && !p.answer)) continue;
        points.push(p.lastResult?.pointsEarned ?? 0);
      }
      this.teamScores.set(id, (this.teamScores.get(id) ?? 0) + teamQuestionPoints(points));
    }
  }

  private teamMembers(id: TeamId): Player[] {
    return [...this.players.values()].filter((p) => p.teamId === id);
  }

  /** The teams in play, best first. */
  private rankedTeams(): RankedTeam[] {
    return rankTeams(
      this.teamIds.map((id) => ({
        id,
        name: TEAM_NAMES[id],
        score: this.teamScores.get(id) ?? 0,
        playerCount: this.teamMembers(id).length,
      })),
    ).map(({ team }) => team);
  }

  private standingsPayload(size: number): StandingsPayload {
    const top = topPlayers(this.players.values(), size);
    return this.mode === 'teams' ? { top, teams: this.rankedTeams() } : { top };
  }

  /** Team mode only: teams + members, to everyone by default. */
  private sendTeams(send: Send = this.transport.toAll.bind(this.transport)): void {
    if (this.mode !== 'teams') return;
    const payload: LobbyTeamsPayload = {
      teams: this.teamIds.map((id) => ({
        id,
        name: TEAM_NAMES[id],
        members: this.teamMembers(id).map(lobbyMember),
      })),
    };
    send('lobby:teams', payload);
  }

  // ---------- Helpers ----------

  private onAnswersChanged(): void {
    this.sendAnswerCount();
    if (this.allAnswered()) this.enterReveal();
  }

  /** Is the current question still waiting for this player? */
  private isAwaited(p: Player): boolean {
    if (this.phase === 'ANSWERING' && p.answer) return false;
    // Excused players (« Continuer sans ») are awaited again only once they are back.
    return p.socketId !== null || !this.excused.has(p.id);
  }

  /** Everyone answered, except the players the host continued without. */
  private allAnswered(): boolean {
    for (const p of this.players.values()) if (this.isAwaited(p)) return false;
    return true;
  }

  // ---------- Pause ----------

  private isTimedPhase(): boolean {
    return this.phase === 'QUESTION_INTRO' || this.phase === 'ANSWERING';
  }

  /** Offline players the current timed phase is waiting for. */
  private awaitedOffline(): Player[] {
    return [...this.players.values()].filter((p) => p.socketId === null && this.isAwaited(p));
  }

  private hostMissing(): boolean {
    return this.hostGoneSince !== null;
  }

  /**
   * Re-evaluates the pause after anything that changes who is connected or awaited: pauses
   * (once the grace period of the earliest drop is over, or right away with `immediate`),
   * updates the waiting list, starts / cancels the resume countdown.
   */
  private checkPause({ immediate = false } = {}): void {
    this.clearGraceTimer();
    if (!this.isTimedPhase()) return;
    const missing = this.awaitedOffline();
    const someoneMissing = missing.length > 0 || this.hostMissing();
    const pause = this.pause;
    if (pause) {
      if (someoneMissing && pause.resumeAt !== null) {
        this.clearResumeTimer();
        pause.resumeAt = null;
      }
      this.broadcastState(); // new waiting list
      if (!someoneMissing && pause.resumeAt === null) this.startResumeCountdown(pause);
      return;
    }
    if (!someoneMissing) return;
    const since = Math.min(
      ...missing.map((p) => p.offlineSince ?? Date.now()),
      this.hostGoneSince ?? Infinity,
    );
    const graceLeft = since + PAUSE_GRACE_MS - Date.now();
    if (immediate || graceLeft <= 0) this.enterPause(since);
    else this.graceTimer = setTimeout(() => this.checkPause(), graceLeft);
  }

  /** Freezes the timer at its value at `since` (the grace period is given back). */
  private enterPause(since: number): void {
    const now = Date.now();
    const frozenAt = Math.min(now, Math.max(since, this.phaseStartedAt));
    this.clearTimer();
    this.pause = {
      since: now,
      frozenAt,
      remainingMs: Math.max(0, (this.phaseEndsAt ?? now) - frozenAt),
      resumeAt: null,
    };
    this.broadcastState();
  }

  private startResumeCountdown(pause: Pause): void {
    pause.resumeAt = Date.now() + RESUME_COUNTDOWN_MS;
    this.sendResuming();
    this.resumeTimer = setTimeout(() => this.endPause(), RESUME_COUNTDOWN_MS);
  }

  /** The countdown is over: the timer goes on from its frozen value. */
  private endPause(): void {
    const pause = this.pause;
    if (!pause) return;
    this.clearPause();
    const now = Date.now();
    if (this.phase === 'ANSWERING') {
      this.answeringStartedAt += now - pause.frozenAt;
      // The game waited for them: everyone connected now had the whole question (team averages).
      for (const p of this.players.values()) if (p.socketId) this.presentIds.add(p.id);
    }
    this.phaseEndsAt = now + pause.remainingMs;
    this.timer = setTimeout(() => this.onPhaseTimeout(), pause.remainingMs);
    this.broadcastState();
    if (this.phase === 'ANSWERING' && this.allAnswered()) this.enterReveal();
  }

  private sendResuming(send: Send = this.transport.toAll.bind(this.transport)): void {
    const resumeAt = this.pause?.resumeAt;
    if (resumeAt != null) send('game:resuming', { inMs: Math.max(0, resumeAt - Date.now()) });
  }

  private pausePayload(pause: Pause): GamePause {
    return {
      waitingFor: this.awaitedOffline().map(lobbyMember),
      hostMissing: this.hostMissing(),
      sinceMs: Date.now() - pause.since,
    };
  }

  /** End of the QUESTION_INTRO / ANSWERING timer — unless someone dropped during the grace. */
  private onPhaseTimeout(): void {
    this.timer = null;
    if (this.awaitedOffline().length > 0 || this.hostMissing()) {
      this.checkPause({ immediate: true });
      if (this.pause) return;
    }
    if (this.phase === 'QUESTION_INTRO') this.enterAnswering();
    else if (this.phase === 'ANSWERING') this.enterReveal();
  }

  private clearPause(): void {
    this.clearGraceTimer();
    this.clearResumeTimer();
    this.pause = null;
  }

  private clearGraceTimer(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  private clearResumeTimer(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
  }

  // ---------- Payloads ----------

  private sendAnswerCount(send: Send = this.transport.toHost.bind(this.transport)): void {
    let answered = 0;
    let total = 0;
    for (const p of this.players.values()) {
      if (p.answer) answered++;
      if (p.answer || this.isAwaited(p)) total++;
    }
    send('answer:count', { answered, total });
  }

  private sendLobbyPlayers(send: Send = this.transport.toHost.bind(this.transport)): void {
    send('lobby:players', {
      players: [...this.players.values()].map((p) => ({
        ...lobbyMember(p),
        ...(p.teamId !== null && { teamId: p.teamId }),
        ...(p.socketId === null && { offline: true as const }),
      })),
    });
  }

  private showPayload(): QuestionShowPayload {
    const q = this.currentQuestion!;
    return {
      index: this.questionIndex,
      type: q.type,
      text: q.text,
      ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
      choices: choiceTexts(q),
      timeLimitSec: q.timeLimitSec,
      ...(q.type === 'SLIDER' && { slider: sliderPrompt(q.slider) }),
      // Media are for the shared screen only: the prompt below never carries them.
      ...(q.audio && { audio: q.audio, ...(q.audioOnReveal && { audioOnReveal: true as const }) }),
      ...(q.imageUrl &&
        q.imageEffect &&
        q.imageEffect !== 'none' && { imageEffect: q.imageEffect }),
    };
  }

  /** What the phones need to answer — never the question text nor the answer. */
  private promptPayload(): QuestionPromptPayload {
    const q = this.currentQuestion!;
    const prompt: QuestionPromptPayload = {
      index: this.questionIndex,
      type: q.type,
      timeLimitSec: q.timeLimitSec,
    };
    if (q.type === 'SLIDER') prompt.slider = sliderPrompt(q.slider);
    else if (q.type === 'TYPE_ANSWER') prompt.maxLength = TYPE_ANSWER_MAX_LENGTH;
    else prompt.choiceCount = q.choices.length;
    return prompt;
  }

  private resultPayload(player: Player): PlayerResultPayload {
    const q = this.currentQuestion;
    const ranked = rankPlayers(this.players.values());
    const rank = ranked.find((r) => r.player === player)?.rank ?? ranked.length;
    const team =
      player.teamId === null
        ? undefined
        : rankTeams(this.rankedTeams()).find((t) => t.team.id === player.teamId);
    return {
      correct: player.lastResult?.correct ?? false,
      pointsEarned: player.lastResult?.pointsEarned ?? 0,
      streak: player.streak,
      streakBonus: player.lastResult?.streakBonus ?? 0,
      totalScore: player.totalScore,
      rank,
      ...(team && { team: { id: team.team.id, score: team.team.score, rank: team.rank } }),
      ...(q?.type === 'POLL' && { poll: true as const }),
      ...(q?.type === 'SLIDER' && {
        correctValue: q.slider.correct,
        ...(player.answer?.value != null && { yourValue: player.answer.value }),
      }),
    };
  }

  private broadcastState(): void {
    this.transport.toAll('game:state', this.statePayload());
  }

  /** Also ends any pause (`next()` / `end()` during a pause skip it). */
  private setPhase(phase: GamePhase, durationMs: number | null): void {
    this.clearTimer();
    this.clearPause();
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.phaseEndsAt = durationMs === null ? null : Date.now() + durationMs;
    if (durationMs !== null) this.timer = setTimeout(() => this.onPhaseTimeout(), durationMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }
}

const lobbyMember = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

const sliderPrompt = ({ min, max, step, unit }: SliderSettings): SliderPrompt => ({
  min,
  max,
  step,
  ...(unit && { unit }),
});

/** Checks the answer kind matches the question, then whether it is right and its points. */
function judgeAnswer(
  q: Question,
  given: AnswerInput,
  timePoints: number,
): Omit<Answer, 'responseMs'> {
  const none = { choiceIndex: null, text: null, value: null };
  const invalid = (message: string) => new GameError('INVALID_PAYLOAD', message);
  switch (q.type) {
    case 'MCQ':
    case 'TRUE_FALSE':
    case 'POLL': {
      if (!('choiceIndex' in given)) throw invalid('Cette question attend un choix');
      const i = given.choiceIndex;
      if (!q.choices[i]) throw invalid('Choix invalide');
      const correct = q.type !== 'POLL' && q.choices[i]!.isCorrect;
      return { ...none, choiceIndex: i, correct, points: correct ? timePoints : 0 };
    }
    case 'TYPE_ANSWER': {
      if (!('text' in given)) throw invalid('Cette question attend une réponse écrite');
      const text = given.text.trim().slice(0, TYPE_ANSWER_MAX_LENGTH);
      const correct = matchesAnswer(text, q.acceptedAnswers, q.typoTolerance);
      return { ...none, text, correct, points: correct ? timePoints : 0 };
    }
    case 'SLIDER': {
      if (!('value' in given)) throw invalid('Cette question attend un nombre');
      const { min, max, correct, margin } = q.slider;
      if (given.value < min || given.value > max) throw invalid('Valeur hors limites');
      return {
        ...none,
        value: given.value,
        ...sliderPoints(timePoints, given.value, correct, margin),
      };
    }
  }
}
