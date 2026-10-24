import { randomUUID } from 'node:crypto';
import {
  DEFAULT_TEAM_COUNT,
  LEADERBOARD_SIZE,
  MAX_PLAYERS_PER_GAME,
  PAUSE_GRACE_MS,
  PODIUM_SIZE,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  SURVIVAL_DEFAULT_HEARTS,
  TEAM_NAMES,
  TYPE_ANSWER_MAX_LENGTH,
  buzzerAnswer,
  choiceTexts,
  correctChoiceIndexes,
  hasRightAnswer,
  randomAvatarId,
  type AnswerInput,
  type AvatarId,
  type DrawGuess,
  type DrawStroke,
  type DrawStrokesPayload,
  type GameMode,
  type GamePause,
  type GamePhase,
  type GameStatePayload,
  type HauntType,
  type JokerType,
  type LobbyMember,
  type LobbyTeamsPayload,
  type PinPoint,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type RankedPlayer,
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
import {
  buzzerAnswerOf,
  buzzerResult,
  buzzerReveal,
  buzzerStatus,
  newBuzzerRound,
  type BuzzerRound,
} from './buzzer.js';
import { GameError } from './errors.js';
import { checkVote, otherLies, startVote, writeLie } from './questionTypes/bluff.js';
import {
  addStrokes,
  checkGuess,
  drawStatus,
  newRotation,
  startDraw,
} from './questionTypes/draw.js';
import { Jokers } from './jokers.js';
import { matchesAnswer, normalizeAnswer } from './matching.js';
import { Survival } from './survival.js';
import {
  NO_SETUP,
  extraBonusPoints,
  extraPromptFields,
  extraResultFields,
  extraRevealDetails,
  extraShowFields,
  isExtraQuestion,
  judgeExtra,
  prepareQuestion,
  settleExtra,
  type ClassicQuestion,
  type QuestionSetup,
} from './questionTypes/index.js';
import {
  computePoints,
  sliderPoints,
  rankPlayers,
  rankTeams,
  streakBonus,
  teamQuestionPoints,
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

/**
 * A player's answer to the current question: one of choice / typed text / slider value, or for
 * the types of `questionTypes/`: order (shown indexes), point on the picture, player voted for.
 */
export interface Answer {
  choiceIndex: number | null;
  text: string | null;
  value: number | null;
  order?: number[];
  point?: PinPoint;
  votedFor?: string;
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
  /** Games with jokers: the jokers played during the game. */
  jokersUsed?: JokerType[];
  /** « Survie »: hearts left, and the question index of the elimination (null: survivor). */
  hearts?: number;
  eliminatedAt?: number | null;
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
  /** Jokers (power-ups, PLAN.md §3). */
  jokers?: boolean;
  /** Random source of the jokers and of the « Dessine-moi » words (tests). */
  random?: () => number;
  /** Same fixed starting hand for every player (e2e tests, `E2E_JOKER_HAND`). */
  jokerHand?: JokerType[];
  /** « Survie »: hearts per player (default SURVIVAL_DEFAULT_HEARTS). */
  hearts?: number;
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
  /** Drawn when the current question starts (ORDER shuffle), see `questionTypes/`. */
  private setup: QuestionSetup = NO_SETUP;
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
  /** « Buzzer » question: who has the hand, who answered wrong (`game/buzzer.ts`). */
  private buzzer: BuzzerRound | null = null;
  /** « Buzzer »: ANSWERING timer frozen while the player who has the hand answers out loud. */
  private hold: { remainingMs: number } | null = null;

  readonly mode: GameMode;
  /** Team mode: the teams offered in the lobby, then (from the start) the ones that have players. */
  private teamIds: TeamId[] = [];
  private readonly teamScores = new Map<TeamId, number>();
  /** Players connected when the current ANSWERING phase started (team averages). */
  private readonly presentIds = new Set<string>();
  /**
   * Joker engine (`game/jokers.ts`): games with jokers, and « Survie » games (the ghosts' haunts
   * reuse its Gel / Brouilleur) — without hands when the Jokers option is off.
   */
  readonly jokers: Jokers | null;
  /** The Jokers option: players get jokers. */
  readonly withJokers: boolean;
  /** « Survie » mode only (`game/survival.ts`). */
  readonly survival: Survival | null;
  /** > 0 while copied answers are being recorded (`recordAnswer`). */
  private recordingCopies = 0;
  /** « Dessine-moi »: who drew how often, so everyone draws in turn (`questionTypes/draw.ts`). */
  private readonly drawRotation = newRotation();
  /** Random source (« Dessine-moi » words; tests can fix it). */
  private readonly random: () => number;

  constructor(
    readonly pin: string,
    readonly quiz: Quiz,
    private readonly transport: GameTransport,
    private readonly hooks: GameHooks = {},
    settings: GameSettings = { mode: 'solo' },
  ) {
    this.mode = settings.mode;
    this.random = settings.random ?? Math.random;
    if (this.mode === 'teams') {
      const count = settings.teamCount ?? DEFAULT_TEAM_COUNT;
      this.teamIds = ([0, 1, 2, 3] as const).slice(0, count);
      for (const id of this.teamIds) this.teamScores.set(id, 0);
    }
    this.withJokers = !!settings.jokers;
    this.jokers =
      this.withJokers || this.mode === 'survival'
        ? new Jokers(
            {
              mode: this.mode,
              phase: () => this.phase,
              questionIndex: () => this.questionIndex,
              question: () => this.currentQuestion,
              paused: () => this.paused,
              players: () => this.players,
              elapsedMs: () =>
                this.phase === 'ANSWERING' ? Date.now() - this.answeringStartedAt : 0,
              recordAnswer: (player, given, responseMs) =>
                this.recordAnswer(player, given, responseMs),
              bluffLies: (playerId) =>
                this.setup.bluff?.stage === 'vote' ? otherLies(this.setup.bluff, playerId) : null,
              transport,
            },
            settings.random,
            settings.jokerHand,
            this.withJokers,
          )
        : null;
    this.survival =
      this.mode === 'survival' && this.jokers
        ? new Survival(
            {
              phase: () => this.phase,
              paused: () => this.paused,
              players: () => this.players,
              jokers: this.jokers,
              transport,
            },
            settings.hearts ?? SURVIVAL_DEFAULT_HEARTS,
          )
        : null;
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
    this.jokers?.deal();
    this.survival?.start();
    this.sendSurvival();
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
        return this.finishAnswering();
      case 'REVEAL':
        return this.enterLeaderboard();
      case 'LEADERBOARD':
        // « Survie »: one survivor left (or nobody) → straight to the podium.
        return this.questionIndex + 1 < this.totalQuestions && !this.survival?.finished()
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
    this.setup.bluff?.lies.delete(playerId); // « Mytho ! »: their lie goes with them
    // « Buzzer »: the hand is free again, the timer goes on.
    if (this.buzzer?.holder === playerId) {
      this.buzzer.holder = null;
      this.releaseHold();
    }
    if (this.phase !== 'LOBBY') this.kicked.push(player);
    this.excused.delete(playerId);
    if (player.socketId) {
      this.transport.toSocket(player.socketId, 'player:kicked', {});
      this.transport.detachSocket(player.socketId);
      player.socketId = null;
    }
    this.sendLobbyPlayers();
    this.sendTeams();
    this.sendSurvival();
    this.jokers?.onKick();
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
    this.sendSurvival(send);
    const phase = this.phase;
    if (this.currentQuestion && phase !== 'PODIUM' && phase !== 'ENDED')
      send('question:show', this.showPayload());
    if (phase === 'ANSWERING' && this.setup.draw) send('draw:strokes', this.drawingPayload());
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
    this.sendSurvival();
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
    this.sendSurvival(send);
    this.jokers?.sendState(player, send);
    if (this.phase === 'ANSWERING' && !player.answer) {
      this.transport.toSocket(sid, 'question:prompt', this.promptPayload(player));
      // « Dessine-moi »: the drawer's phone gets its drawing back.
      if (this.isDrawer(player))
        this.transport.toSocket(sid, 'draw:strokes', this.drawingPayload());
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
   * it must match the question type (`INVALID_PAYLOAD` otherwise). « Dessine-moi »: `guess` tells
   * whether the word was found (wrong guesses aren't recorded).
   */
  answer(
    playerId: string,
    questionIndex: number,
    input: number | AnswerInput,
  ): { guess?: DrawGuess } {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    const question = this.currentQuestion;
    if (this.phase !== 'ANSWERING' || questionIndex !== this.questionIndex || !question)
      throw new GameError('NOT_ANSWERING', 'Trop tard !');
    if (player.answer) throw new GameError('ALREADY_ANSWERED', 'Réponse déjà envoyée');
    if (this.pause) throw new GameError('GAME_PAUSED', 'Partie en pause');
    if (question.buzzer)
      throw new GameError('INVALID_PAYLOAD', 'Question au buzzer : appuie sur BUZZ');

    const given = typeof input === 'number' ? { choiceIndex: input } : input;
    // « Mytho ! », stage 1: the lie is stored, not scored (nor copied); stage 2 is the vote.
    const bluff = this.setup.bluff;
    if (question.type === 'BLUFF' && bluff?.stage === 'write') {
      if (!('text' in given)) throw new GameError('INVALID_PAYLOAD', 'Écris un mytho');
      writeLie(question, bluff, player.id, given.text);
      this.touch();
      this.onAnswersChanged();
      return {};
    }
    if (question.type === 'DRAW') return { guess: this.guess(player, given) };
    if (bluff && 'choiceIndex' in given) checkVote(bluff, player.id, given.choiceIndex);
    const responseMs = Date.now() - this.answeringStartedAt;
    this.jokers?.checkAnswer(player, responseMs);
    this.recordAnswer(player, given, responseMs);
    return {};
  }

  /** « Dessine-moi »: a guess — recorded (and scored) only when right; a wrong one can be retried. */
  private guess(player: Player, given: AnswerInput): DrawGuess {
    const draw = this.setup.draw!;
    if (this.isDrawer(player)) throw new GameError('INVALID_PAYLOAD', 'C’est toi qui dessines !');
    if (!('text' in given)) throw new GameError('INVALID_PAYLOAD', 'Cette question attend un mot');
    const guess = checkGuess(draw, given.text);
    this.touch();
    if (guess !== 'found') return guess;
    const index = this.questionIndex;
    this.recordAnswer(player, given, Date.now() - this.answeringStartedAt);
    // Who found it (never what they typed), for the TV and the phones.
    if (this.phase === 'ANSWERING' && this.questionIndex === index) this.broadcastState();
    return guess;
  }

  /**
   * « Dessine-moi » (`player:draw`): the drawer's new strokes, relayed to the TV. Refused while
   * paused (the canvas freezes) and outside ANSWERING.
   */
  draw(playerId: string, questionIndex: number, strokes: DrawStroke[], clear = false): void {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    const draw = this.setup.draw;
    if (this.phase !== 'ANSWERING' || questionIndex !== this.questionIndex || !draw)
      throw new GameError('NOT_ANSWERING', 'Trop tard !');
    if (this.pause) throw new GameError('GAME_PAUSED', 'Partie en pause');
    if (!this.isDrawer(player))
      throw new GameError('INVALID_PAYLOAD', 'Ce n’est pas toi qui dessines');
    const added = addStrokes(draw, strokes, clear);
    this.touch();
    this.transport.toHost('draw:strokes', {
      index: this.questionIndex,
      ...(clear && { clear: true as const }),
      strokes: added,
    });
  }

  /**
   * « Buzzer » (`player:buzz`): the first player processed takes the hand and the timer freezes
   * until the host judges their answer said out loud (`judge`).
   */
  buzz(playerId: string, questionIndex: number): void {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    const round = this.buzzer;
    if (this.phase !== 'ANSWERING' || questionIndex !== this.questionIndex || !round)
      throw new GameError('NOT_ANSWERING', 'Trop tard !');
    if (this.pause) throw new GameError('GAME_PAUSED', 'Partie en pause');
    if (player.answer) throw new GameError('ALREADY_ANSWERED', 'Tu as déjà répondu');
    if (round.holder) {
      const holder = this.players.get(round.holder)?.nickname ?? 'Quelqu’un';
      throw new GameError('BUZZER_TAKEN', `${holder} a buzzé avant toi !`);
    }
    // Gel: the BUZZ is refused for its first seconds (clock time: pauses and holds excluded).
    this.jokers?.checkAnswer(player, this.timerElapsedMs());
    this.touch();
    round.holder = player.id;
    this.hold = { remainingMs: this.timerRemainingMs() };
    this.clearTimer();
    this.broadcastState();
  }

  /**
   * « Buzzer » (`host:judge`), allowed while paused: right → the player wins the question
   * (REVEAL); wrong → they are out for this question and the timer goes on (REVEAL when nobody
   * is left to buzz).
   */
  judge(correct: boolean): void {
    const round = this.buzzer;
    const holder = round?.holder ? this.players.get(round.holder) : undefined;
    if (this.phase !== 'ANSWERING' || !round || !holder)
      throw new GameError('INVALID_PAYLOAD', 'Personne n’a la main');
    this.touch();
    const question = this.currentQuestion!;
    holder.answer = buzzerAnswerOf(correct, question.basePoints, this.timerElapsedMs());
    round.holder = null;
    if (correct) {
      round.winner = holder.id;
      return this.finishAnswering();
    }
    round.wrong.push(holder.id);
    this.releaseHold();
    this.checkPause(); // an offline holder is no longer awaited
    this.onAnswersChanged(); // nobody left to buzz → REVEAL
  }

  /** « Buzzer »: the hand is free again — the frozen timer goes on (or stays paused). */
  private releaseHold(): void {
    const hold = this.hold;
    if (!hold) return;
    this.hold = null;
    if (this.pause) this.pause.remainingMs = hold.remainingMs;
    else {
      this.phaseEndsAt = Date.now() + hold.remainingMs;
      this.timer = setTimeout(() => this.onPhaseTimeout(), hold.remainingMs);
    }
    this.broadcastState();
  }

  /** Time left on the clock of the timed phase: frozen while paused / while someone has the hand. */
  private timerRemainingMs(): number {
    if (this.pause) return this.pause.remainingMs;
    if (this.hold) return this.hold.remainingMs;
    return this.phaseEndsAt === null ? 0 : Math.max(0, this.phaseEndsAt - Date.now());
  }

  /** ANSWERING time used on the clock (pauses and buzzer holds excluded). */
  private timerElapsedMs(): number {
    const limitMs = (this.currentQuestion?.timeLimitSec ?? 0) * 1000;
    return Math.max(0, limitMs - this.timerRemainingMs());
  }

  /** Plays a joker (games with jokers, `player:joker`). */
  useJoker(playerId: string, questionIndex: number, joker: JokerType, targetId?: string): void {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    if (!this.jokers || !this.withJokers)
      throw new GameError('JOKER_REFUSED', 'Pas de jokers dans cette partie');
    this.touch();
    this.jokers.use(player, questionIndex, joker, targetId);
  }

  /** « Survie »: a ghost haunts a living player (`player:haunt`). */
  haunt(playerId: string, haunt: HauntType, targetId: string): void {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('SESSION_NOT_FOUND', 'Joueur introuvable');
    if (!this.survival) throw new GameError('JOKER_REFUSED', 'Pas une partie « Survie »');
    this.touch();
    this.survival.haunt(player, haunt, targetId);
  }

  /** Judges and stores an answer (sent by the player, or copied with a Copieur). */
  private recordAnswer(player: Player, given: AnswerInput, responseMs: number): void {
    const question = this.currentQuestion!;
    const limitMs = question.timeLimitSec * 1000;
    const points = (ms: number) => computePoints(question.basePoints, ms, limitMs);
    // T27 types (ordre, point, « Qui de nous ? », nuage de mots) have their own judge.
    const judge = (timePoints: number) =>
      isExtraQuestion(question)
        ? judgeExtra(question, given, timePoints, this.setup, this.players, player.id)
        : judgeAnswer(question, given, timePoints);
    const scoringMs = this.jokers?.scoringMs(player.id, responseMs) ?? responseMs;
    player.answer = { ...judge(points(scoringMs)), responseMs };
    const extra =
      scoringMs === responseMs ? 0 : player.answer.points - judge(points(responseMs)).points;
    this.touch();
    // Copieur: the copiers' answers are recorded too, before checking whether all answered.
    this.recordingCopies++;
    try {
      this.jokers?.onAnswered(player, given, extra);
    } finally {
      this.recordingCopies--;
    }
    if (this.recordingCopies === 0) this.onAnswersChanged();
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
        ...(this.withJokers && this.jokers && { jokersUsed: this.jokers.usedBy(player.id) }),
        ...(this.survival && {
          hearts: this.survival.info(player.id).hearts,
          eliminatedAt: this.survival.info(player.id).eliminatedAt ?? null,
        }),
      });
    return [
      ...this.ranked(this.players.values()).map(standing(0)),
      ...this.ranked(this.kicked).map(standing(this.players.size)),
    ];
  }

  /** Competition ranking: by score, or the survivor ranking in « Survie ». */
  private ranked(players: Iterable<Player>): { player: Player; rank: number }[] {
    return this.survival ? this.survival.rank(players) : rankPlayers(players);
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
      ...(this.withJokers && { jokers: true as const }),
    };
    if (this.pause) {
      state.remainingMs = this.pause.remainingMs;
      state.paused = this.pausePayload(this.pause);
    } else if (this.hold) {
      state.remainingMs = this.hold.remainingMs;
    } else if (this.phaseEndsAt !== null) {
      state.remainingMs = Math.max(0, this.phaseEndsAt - Date.now());
    }
    if (this.phase === 'ANSWERING' && this.buzzer)
      state.buzzer = buzzerStatus(this.buzzer, this.players);
    if (this.isTimedPhase() && this.setup.draw)
      state.draw = drawStatus(this.setup.draw, this.players);
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
    this.setup = prepareQuestion(question);
    // « Dessine-moi »: the next drawer in turn and a word (only their phone will get it).
    if (question.type === 'DRAW') {
      const players = [...this.players.values()];
      const draw = startDraw(question, players, this.drawRotation, this.teamIds, this.random);
      this.setup = { ...this.setup, draw };
    }
    this.buzzer = question.buzzer ? newBuzzerRound() : null;
    this.excused.clear();
    for (const p of this.players.values()) {
      p.answer = null;
      p.lastResult = null;
    }
    this.setPhase('QUESTION_INTRO', QUESTION_INTRO_MS);
    this.broadcastState();
    this.transport.toHost('question:show', this.showPayload());
    this.jokers?.startQuestion();
    this.survival?.startQuestion();
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
    this.sendPrompts();
    this.sendAnswerCount();
    this.checkPause();
    // Nobody to wait for → don't block on the timer.
    if (!this.pause && this.allAnswered()) this.finishAnswering();
  }

  private sendPrompts(): void {
    for (const p of this.players.values()) {
      if (p.socketId) this.transport.toSocket(p.socketId, 'question:prompt', this.promptPayload(p));
    }
  }

  /** End of ANSWERING (everyone answered, timer, host): the reveal — or the « Mytho ! » vote. */
  private finishAnswering(): void {
    const question = this.currentQuestion;
    const bluff = this.setup.bluff;
    if (this.phase === 'ANSWERING' && question?.type === 'BLUFF' && bluff?.stage === 'write') {
      startVote(question, bluff);
      // Same phase, new timer: pauses, rejoins and `responseMs` work as for any question.
      this.setPhase('ANSWERING', question.voteTimeSec * 1000);
      this.answeringStartedAt = Date.now();
      for (const p of this.players.values()) if (p.socketId) this.presentIds.add(p.id);
      this.broadcastState();
      this.transport.toHost('question:show', this.showPayload());
      this.jokers?.onBluffVote();
      this.sendPrompts();
      this.sendAnswerCount();
      this.checkPause();
      if (!this.pause && this.allAnswered()) this.enterReveal();
      return;
    }
    this.enterReveal();
  }

  private enterReveal(): void {
    const question = this.currentQuestion;
    if (this.phase !== 'ANSWERING' || !question) return;
    this.setPhase('REVEAL', null);

    const choices = choiceTexts(question);
    // « Buzzer »: nobody tapped a shape, and the type's own rules don't apply.
    const buzzer = !!question.buzzer;
    const distribution = buzzer ? [] : choices.map(() => 0);
    if (isExtraQuestion(question) && !buzzer) settleExtra(question, this.players.values());
    // A poll (or another type without a right answer) leaves the streak as it is.
    const poll = !hasRightAnswer(question.type);
    let correctCount = 0;
    let answerCount = 0;
    for (const p of this.players.values()) {
      const a = p.answer;
      if (a) answerCount++;
      // Shape choices only (a « Mytho ! » vote is a `choiceIndex` too, among its own options).
      if (a?.choiceIndex != null && a.choiceIndex < distribution.length)
        distribution[a.choiceIndex] = (distribution[a.choiceIndex] ?? 0) + 1;
      const correct = a?.correct ?? false;
      // « Dessine-moi »: the drawer had nothing to answer, their streak is left as it is.
      const drew = this.isDrawer(p);
      // Bouclier: a wrong answer keeps the streak.
      if (!poll && !drew && (correct || !this.jokers?.savesStreak(p.id)))
        p.streak = correct ? p.streak + 1 : 0;
      // A 0-point question awards nothing, streak bonus included (the streak still counts).
      const bonus = correct && question.basePoints > 0 ? streakBonus(p.streak) : 0;
      // « Mytho ! »: + points for every player fooled by your lie, voted or not.
      const others =
        isExtraQuestion(question) && !buzzer
          ? extraBonusPoints(question, this.setup, p, this.players.values())
          : 0;
      const questionPoints = (a?.points ?? 0) + bonus + others;
      const pointsEarned = this.jokers?.adjustPoints(p, correct, questionPoints) ?? questionPoints;
      p.totalScore += pointsEarned;
      if (correct) {
        p.correctCount++;
        correctCount++;
      }
      p.lastResult = { correct, pointsEarned, streakBonus: bonus };
    }
    this.jokers?.afterScoring(poll);
    if (this.mode === 'teams') this.scoreTeams();
    // « Survie »: hearts lost, ghosts, haunts — before the results (they rank survivors first).
    // Excused (« Continuer sans ») and absent-for-the-whole-question players keep their hearts;
    // « Buzzer »: only a wrong buzz costs one (not buzzing doesn't). « Dessine-moi »: never.
    this.survival?.settle(
      question,
      this.questionIndex,
      (p) =>
        question.type === 'DRAW' ||
        (buzzer ? !p.answer : this.excused.has(p.id) || (!this.presentIds.has(p.id) && !p.answer)),
    );
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
    this.sendSurvival();
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
    if (this.buzzer) return { buzzer: buzzerReveal(question, this.buzzer, this.players) };
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
    if (isExtraQuestion(question))
      return extraRevealDetails(question, this.setup, answers, this.players.values());
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
      // Jokers can make a member's points negative (Double ou rien, Voleur): never below 0.
      const score = (this.teamScores.get(id) ?? 0) + teamQuestionPoints(points);
      this.teamScores.set(id, Math.max(0, score));
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
    const jokers = this.withJokers && size === LEADERBOARD_SIZE ? this.jokers : null;
    const survival = this.survival;
    const top = this.ranked(this.players.values())
      .slice(0, size)
      .map(({ player }): RankedPlayer => {
        const info = jokers?.leaderboardInfo(player.id);
        return {
          nickname: player.nickname,
          avatar: player.avatar,
          score: player.totalScore,
          ...(info && { jokers: info }),
          ...(survival && { survival: survival.info(player.id) }),
        };
      });
    return this.mode === 'teams' ? { top, teams: this.rankedTeams() } : { top };
  }

  /** « Survie » only: everyone's hearts, to everyone by default. */
  private sendSurvival(send?: Send): void {
    this.survival?.send(send);
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
    if (this.allAnswered()) this.finishAnswering();
  }

  /** « Mytho ! » writing stage: the lies are what the question waits for. */
  private writingLies(): boolean {
    return this.setup.bluff?.stage === 'write';
  }

  /** Has the player done what the current stage asks (answer, or lie while writing)? */
  private hasAnswered(p: Player): boolean {
    return this.writingLies() ? !!this.setup.bluff?.lies.has(p.id) : !!p.answer;
  }

  /** Is the current question still waiting for this player? */
  private isAwaited(p: Player, copying = new Set<string>()): boolean {
    if (this.writingLies())
      return !this.setup.bluff!.lies.has(p.id) && (p.socketId !== null || !this.excused.has(p.id));
    if (this.phase === 'ANSWERING' && p.answer) return false;
    // Copieur: answers when the target does (target gone / copy loop: nothing to wait for).
    const target = this.jokers?.copyTargetOf(p.id);
    if (target !== undefined) {
      if (!target || copying.has(p.id)) return false;
      return this.isAwaited(target, copying.add(p.id));
    }
    // Excused players (« Continuer sans ») are awaited again only once they are back.
    return p.socketId !== null || !this.excused.has(p.id);
  }

  /** Everyone answered, except the players the host continued without (and the drawer). */
  private allAnswered(): boolean {
    for (const p of this.players.values()) if (!this.isDrawer(p) && this.isAwaited(p)) return false;
    return true;
  }

  /**
   * « Dessine-moi »: the drawer has nothing to answer (left out of « all answered » and of the
   * answer count), but the game still waits for them when they drop (nobody could draw).
   */
  private isDrawer(p: Player): boolean {
    return this.setup.draw?.drawerId === p.id;
  }

  // ---------- Pause ----------

  private isTimedPhase(): boolean {
    return this.phase === 'QUESTION_INTRO' || this.phase === 'ANSWERING';
  }

  /** Offline players the current timed phase is waiting for. */
  private awaitedOffline(): Player[] {
    return [...this.players.values()].filter(
      // A copier answers by itself: no need to wait for its phone.
      (p) => p.socketId === null && this.isAwaited(p) && !this.jokers?.copyTargetOf(p.id),
    );
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
      // « Buzzer »: the clock was already frozen by the player who has the hand.
      remainingMs: this.hold?.remainingMs ?? Math.max(0, (this.phaseEndsAt ?? now) - frozenAt),
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
    if (this.hold) {
      // « Buzzer »: still answering out loud, the clock stays frozen until the host judges.
      this.hold.remainingMs = pause.remainingMs;
      return this.broadcastState();
    }
    this.phaseEndsAt = now + pause.remainingMs;
    this.timer = setTimeout(() => this.onPhaseTimeout(), pause.remainingMs);
    this.broadcastState();
    if (this.phase === 'ANSWERING' && this.allAnswered()) this.finishAnswering();
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
    else if (this.phase === 'ANSWERING') this.finishAnswering();
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
      if (this.isDrawer(p)) continue;
      const done = this.hasAnswered(p);
      if (done) answered++;
      if (done || this.isAwaited(p)) total++;
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
      // « Buzzer »: the question without its choices, and the answer for the host to judge.
      choices: q.buzzer ? [] : choiceTexts(q),
      timeLimitSec: q.timeLimitSec,
      ...(q.buzzer && { buzzer: { answer: buzzerAnswer(q) } }),
      ...(q.type === 'SLIDER' && !q.buzzer && { slider: sliderPrompt(q.slider) }),
      // Media are for the shared screen only: the prompt below never carries them.
      ...(q.audio && { audio: q.audio, ...(q.audioOnReveal && { audioOnReveal: true as const }) }),
      ...(q.imageUrl &&
        q.imageEffect &&
        q.imageEffect !== 'none' && { imageEffect: q.imageEffect }),
      // ORDER au buzzer keeps its (shuffled) items: they are needed to say the order.
      ...(isExtraQuestion(q) && extraShowFields(q, this.setup, this.players.values())),
    };
  }

  /** What the phones need to answer — never the question text nor the answer. */
  private promptPayload(player: Player): QuestionPromptPayload {
    const q = this.currentQuestion!;
    const prompt: QuestionPromptPayload = {
      index: this.questionIndex,
      type: q.type,
      timeLimitSec: q.timeLimitSec,
    };
    if (q.buzzer) prompt.buzzer = true;
    else if (q.type === 'SLIDER') prompt.slider = sliderPrompt(q.slider);
    else if (q.type === 'TYPE_ANSWER') prompt.maxLength = TYPE_ANSWER_MAX_LENGTH;
    else if (isExtraQuestion(q))
      Object.assign(prompt, extraPromptFields(q, this.setup, this.players.values(), player.id));
    else prompt.choiceCount = q.choices.length;
    return prompt;
  }

  private resultPayload(player: Player): PlayerResultPayload {
    const q = this.currentQuestion;
    const ranked = this.ranked(this.players.values());
    const rank = ranked.find((r) => r.player === player)?.rank ?? ranked.length;
    const team =
      player.teamId === null
        ? undefined
        : rankTeams(this.rankedTeams()).find((t) => t.team.id === player.teamId);
    const jokers = this.jokers?.results(player.id);
    return {
      correct: player.lastResult?.correct ?? false,
      pointsEarned: player.lastResult?.pointsEarned ?? 0,
      streak: player.streak,
      streakBonus: player.lastResult?.streakBonus ?? 0,
      totalScore: player.totalScore,
      rank,
      ...(team && { team: { id: team.team.id, score: team.team.score, rank: team.rank } }),
      ...(q && !hasRightAnswer(q.type) && { poll: true as const }),
      ...(q && this.buzzer && { buzzer: buzzerResult(q, this.buzzer, player, this.players) }),
      ...(q &&
        isExtraQuestion(q) &&
        !q.buzzer &&
        extraResultFields(q, player, this.setup, this.players.values())),
      ...(q?.type === 'SLIDER' &&
        !q.buzzer && {
          correctValue: q.slider.correct,
          ...(player.answer?.value != null && { yourValue: player.answer.value }),
        }),
      ...(jokers && { jokers }),
      ...(this.survival && { survival: this.survival.resultFields(player.id) }),
    };
  }

  /** « Dessine-moi »: the whole drawing so far (rejoins). */
  private drawingPayload(): DrawStrokesPayload {
    return { index: this.questionIndex, clear: true, strokes: this.setup.draw?.strokes ?? [] };
  }

  private broadcastState(): void {
    this.transport.toAll('game:state', this.statePayload());
  }

  /** Also ends any pause (`next()` / `end()` during a pause skip it). */
  private setPhase(phase: GamePhase, durationMs: number | null): void {
    this.clearTimer();
    this.clearPause();
    this.hold = null;
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
  q: ClassicQuestion,
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
