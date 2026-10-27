/**
 * Socket.IO protocol — THE contract between apps/web and apps/server.
 * Keep in sync with docs/PLAN.md §4. Any change must be noted in docs/TASKS.md.
 */
import { z } from 'zod';
import { AvatarId } from './avatars.js';
import { DRAW_MAX_CHUNKS, DrawStrokeSchema, type DrawStroke } from './draw.js';
import { GameMode, GamePhase, Nickname, Pin, TeamCount, TeamId } from './game.js';
import { JokerType } from './jokers.js';
import { HauntType, SurvivalHearts } from './survival.js';
import {
  ORDER_MAX_ITEMS,
  ORDER_MIN_ITEMS,
  PinPointSchema,
  QuizTheme,
  TYPE_ANSWER_MAX_LENGTH,
  type ImageEffect,
  type PinPoint,
  type PinZone,
  type QuestionAudio,
  type QuestionType,
  type SliderSettings,
} from './quiz.js';

// ---------- Common ----------

export const ErrorCode = z.enum([
  'GAME_NOT_FOUND',
  'GAME_ALREADY_STARTED',
  'GAME_FULL',
  'NICKNAME_TAKEN',
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'QUIZ_NOT_FOUND',
  'NOT_ANSWERING',
  'ALREADY_ANSWERED',
  'SESSION_NOT_FOUND',
  /** Team mode: a player has no team, or fewer than 2 teams have players. */
  'TEAMS_NOT_READY',
  /** Answer sent while the game is paused (a player or the host screen lost the connection). */
  'GAME_PAUSED',
  /** Jokers: not in hand, already one this question, wrong moment / target / question type. */
  'JOKER_REFUSED',
  /** Gel: this player's answers are refused for the first seconds of the question. */
  'FROZEN',
  /** « Mytho ! »: the lie is (almost) the real answer. */
  'LIE_TOO_CLOSE',
  /** « Buzzer »: someone else has the hand (or buzzed first). */
  'BUZZER_TAKEN',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

/** Every ack callback receives either `{ ok: true, ...data }` or `{ ok: false, error }`. */
export type Ack<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: ErrorPayload };

export interface RankedPlayer {
  nickname: string;
  avatar: AvatarId;
  score: number;
  /** `leaderboard` of a game with jokers: the player's hand and the joker played last question. */
  jokers?: { hand: JokerType[]; used?: JokerType };
  /** « Survie »: hearts left (0 = ghost) and the question index they were eliminated at. */
  survival?: { hearts: number; eliminatedAt?: number };
}

/** A player as listed in the lobby / team columns. */
export interface LobbyMember {
  id: string;
  nickname: string;
  avatar: AvatarId;
}

/** Team mode: one team's standing, best first. `score` = sum of per-question averages. */
export interface RankedTeam {
  id: TeamId;
  name: string;
  score: number;
  playerCount: number;
}

export interface StandingsPayload {
  top: RankedPlayer[];
  /** Team mode only: every team still in the game, best first. */
  teams?: RankedTeam[];
}

// ---------- Client → server payloads (validated with zod on the server) ----------

export const HostCreatePayload = z.object({
  quizId: z.string().min(1),
  /** Default `solo`. */
  mode: GameMode.optional(),
  /** Team mode only, default 2. */
  teamCount: TeamCount.optional(),
  /** Jokers (power-ups, PLAN.md §3). Default off (the start dialog turns them on). */
  jokers: z.boolean().optional(),
  /** « Survie » only: hearts per player, 1–5 (default 3). */
  hearts: SurvivalHearts.optional(),
  /** TV theme for this game (T40); absent = the quiz's own theme. */
  theme: QuizTheme.optional(),
});
/** Actions only the TV can do (`host:rejoin`, `host:remote`): its `hostToken`. */
export const HostTokenPayload = z.object({ pin: Pin, hostToken: z.string().min(1) });
/**
 * A host action (start, next, pause…) carries the TV's `hostToken` **or** the `remoteToken` of a
 * paired « Télécommande » (T39).
 */
function hostAction<S extends z.ZodRawShape>(shape: S) {
  return z.union([
    z.object({ pin: Pin, hostToken: z.string().min(1), ...shape }),
    z.object({ pin: Pin, remoteToken: z.string().min(1), ...shape }),
  ]);
}
export const HostActionPayload = hostAction({});
export const HostKickPayload = hostAction({ playerId: z.string().min(1) });
export const HostMovePlayerPayload = hostAction({ playerId: z.string().min(1), teamId: TeamId });
/** « Buzzer »: the host judges the answer said out loud by the player who has the hand. */
export const HostJudgePayload = hostAction({ correct: z.boolean() });
/**
 * « 📱 Télécommande » dialog of the TV: the token to put in the remote's link (created the first
 * time); `revoke` = « Déconnecter la télécommande » (a new token, the paired remotes are dropped).
 */
export const HostRemotePayload = HostTokenPayload.extend({ revoke: z.literal(true).optional() });
/** A phone opened the remote link `/remote/<PIN>#<remoteToken>`. */
export const RemoteJoinPayload = z.object({ pin: Pin, remoteToken: z.string().min(1) });
export const TvAction = z.enum(['mute', 'unmute', 'replay']);
export type TvAction = z.infer<typeof TvAction>;
/** Remote → TV: 🔇 / 🔊 the TV's sound, ↻ replay the question's sound clip. */
export const RemoteTvPayload = RemoteJoinPayload.extend({ action: TvAction });

/** `avatar` missing (older clients) → the server picks a random one. */
export const PlayerJoinPayload = z.object({
  pin: Pin,
  nickname: Nickname,
  avatar: AvatarId.optional(),
});
/** Join screen hint: the avatars already taken in this game (before joining). */
export const PlayerAvatarsPayload = z.object({ pin: Pin });
export const PlayerRejoinPayload = z.object({ pin: Pin, sessionToken: z.string().min(1) });
export const PlayerTeamPayload = z.object({ pin: Pin, teamId: TeamId });
const answerTarget = { pin: Pin, questionIndex: z.number().int().min(0) };
/**
 * Exactly one of `choiceIndex` (MCQ, TRUE_FALSE, POLL), `choiceIndexes` (MCQ with
 * `question:prompt.multiple`: every choice the player ticked), `text` (TYPE_ANSWER, WORD_CLOUD), `value`
 * (SLIDER), `order` (ORDER: indexes of `question:prompt.items`, first to last), `point` (PIN:
 * picture fractions) or `playerId` (WHO_OF_US: the player voted for). The server answers
 * `INVALID_PAYLOAD` if the kind doesn't match the question.
 */
export const PlayerAnswerPayload = z.union([
  z.strictObject({ ...answerTarget, choiceIndex: z.number().int().min(0).max(3) }),
  z.strictObject({
    ...answerTarget,
    choiceIndexes: z.array(z.number().int().min(0).max(3)).min(1).max(4),
  }),
  z.strictObject({
    ...answerTarget,
    text: z.string().trim().min(1).max(TYPE_ANSWER_MAX_LENGTH),
  }),
  z.strictObject({ ...answerTarget, value: z.number() }),
  z.strictObject({
    ...answerTarget,
    order: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(ORDER_MAX_ITEMS - 1),
      )
      .min(ORDER_MIN_ITEMS)
      .max(ORDER_MAX_ITEMS),
  }),
  z.strictObject({ ...answerTarget, point: PinPointSchema }),
  z.strictObject({ ...answerTarget, playerId: z.string().min(1).max(64) }),
]);

/** « Buzzer »: the player hits BUZZ on the current question. */
export const PlayerBuzzPayload = z.object({ pin: Pin, questionIndex: z.number().int().min(0) });

/**
 * « Dessine-moi », the drawer only, ANSWERING: new stroke chunks (throttled by the phone);
 * `clear` empties the drawing first.
 */
export const PlayerDrawPayload = z.object({
  pin: Pin,
  questionIndex: z.number().int().min(0),
  clear: z.literal(true).optional(),
  strokes: z.array(DrawStrokeSchema).max(DRAW_MAX_CHUNKS),
});

/** Plays a joker on the current question; `targetId` for Copieur, Gel, Brouilleur, Voleur. */
export const PlayerJokerPayload = z.object({
  pin: Pin,
  questionIndex: z.number().int().min(0),
  joker: JokerType,
  targetId: z.string().min(1).optional(),
});

/** « Survie »: a ghost uses a haunt earned by a correct answer on a living player. */
export const PlayerHauntPayload = z.object({
  pin: Pin,
  haunt: HauntType,
  targetId: z.string().min(1),
});

export type HostCreatePayload = z.infer<typeof HostCreatePayload>;
export type HostActionPayload = z.infer<typeof HostActionPayload>;
export type HostKickPayload = z.infer<typeof HostKickPayload>;
export type HostMovePlayerPayload = z.infer<typeof HostMovePlayerPayload>;
export type HostJudgePayload = z.infer<typeof HostJudgePayload>;
export type HostTokenPayload = z.infer<typeof HostTokenPayload>;
export type HostRemotePayload = z.infer<typeof HostRemotePayload>;
export type RemoteJoinPayload = z.infer<typeof RemoteJoinPayload>;
export type RemoteTvPayload = z.infer<typeof RemoteTvPayload>;
export type PlayerBuzzPayload = z.infer<typeof PlayerBuzzPayload>;
export type PlayerDrawPayload = z.infer<typeof PlayerDrawPayload>;
export type PlayerTeamPayload = z.infer<typeof PlayerTeamPayload>;
export type PlayerJoinPayload = z.infer<typeof PlayerJoinPayload>;
export type PlayerRejoinPayload = z.infer<typeof PlayerRejoinPayload>;
export type PlayerAvatarsPayload = z.infer<typeof PlayerAvatarsPayload>;
export type PlayerAnswerPayload = z.infer<typeof PlayerAnswerPayload>;
export type PlayerJokerPayload = z.infer<typeof PlayerJokerPayload>;
export type PlayerHauntPayload = z.infer<typeof PlayerHauntPayload>;
/** The answer itself, without `pin` / `questionIndex`. */
export type AnswerInput =
  | { choiceIndex: number }
  | { choiceIndexes: number[] }
  | { text: string }
  | { value: number }
  | { order: number[] }
  | { point: PinPoint }
  | { playerId: string };

/**
 * « Dessine-moi », `player:answer` ack: `found` (the guess is right — recorded, scored), `close`
 * (« Presque ! ») or `wrong` (not recorded: the player can try again).
 */
export type DrawGuess = 'found' | 'close' | 'wrong';

export interface PlayerJoinAck {
  playerId: string;
  sessionToken: string;
  avatar: AvatarId;
  /** Took the place of a disconnected player (started game): the fields below are theirs. */
  reclaimed?: true;
  nickname?: string;
  totalScore?: number;
}

export interface ClientToServerEvents {
  'host:create': (
    p: HostCreatePayload,
    ack: (r: Ack<{ pin: string; hostToken: string }>) => void,
  ) => void;
  'host:start': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  'host:next': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  'host:kick': (p: HostKickPayload, ack: (r: Ack) => void) => void;
  'host:end': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  /** Team mode, LOBBY only: puts a player in another team. */
  'host:moveplayer': (p: HostMovePlayerPayload, ack: (r: Ack) => void) => void;
  /** Team mode, LOBBY only: random balanced teams for every player. */
  'host:shuffle': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  /**
   * Host screen reloaded / reconnected: re-attaches this socket as host, then the server
   * re-sends everything the host screen needs for the current phase.
   */
  'host:rejoin': (p: HostTokenPayload, ack: (r: Ack) => void) => void;
  /**
   * QUESTION_INTRO / ANSWERING (`NOT_ANSWERING` otherwise): pauses the game like a lost
   * connection (`game:state.paused.byHost`), until `host:resume`. No-op when already paused.
   */
  'host:pause': (p: HostActionPayload, ack: (r: Ack) => void) => void;
  /** TV only: the « Télécommande » token (created lazily; `revoke` drops the paired remotes). */
  'host:remote': (p: HostRemotePayload, ack: (r: Ack<{ remoteToken: string }>) => void) => void;
  /**
   * « Continuer sans… »: while paused, the missing players become absent for the current
   * question and the game resumes (after the usual 3-2-1 countdown). No-op when not paused.
   */
  'host:resume': (p: HostActionPayload, ack: (r: Ack) => void) => void;

  /**
   * « Télécommande » (T39): pairs this socket as a remote (`UNAUTHORIZED` for a wrong / revoked
   * token), then the server re-sends what the TV gets on `host:rejoin` + `remote:answer`. A remote
   * gets the host events but never counts as the TV (the TV dropping still pauses the game).
   */
  'remote:join': (p: RemoteJoinPayload, ack: (r: Ack) => void) => void;
  /** Relayed to the TV as `tv:control`. */
  'remote:tv': (p: RemoteTvPayload, ack: (r: Ack) => void) => void;
  /**
   * « Buzzer »: ✅ / ❌ on the answer of the player who has the hand (allowed while paused).
   * Right → REVEAL; wrong → that player can't buzz again, the timer goes on (everyone wrong → all can buzz again).
   * `INVALID_PAYLOAD` when nobody has the hand.
   */
  'host:judge': (p: HostJudgePayload, ack: (r: Ack) => void) => void;

  /**
   * In LOBBY: joins. In a started game: takes the place of the disconnected player with that
   * nickname (`reclaimed: true`, their score / team / avatar / streak; the old session token is
   * revoked), `NICKNAME_TAKEN` if that player is connected, `GAME_ALREADY_STARTED` otherwise.
   */
  'player:join': (p: PlayerJoinPayload, ack: (r: Ack<PlayerJoinAck>) => void) => void;
  'player:rejoin': (
    p: PlayerRejoinPayload,
    ack: (
      r: Ack<{ playerId: string; nickname: string; avatar: AvatarId; totalScore: number }>,
    ) => void,
  ) => void;
  /**
   * Join screen, before joining: the avatars already taken in that game (shown dimmed, still
   * selectable). `GAME_NOT_FOUND` for an unknown PIN.
   */
  'player:avatars': (
    p: PlayerAvatarsPayload,
    ack: (r: Ack<{ taken: AvatarId[]; started: boolean }>) => void,
  ) => void;
  /** Team mode, LOBBY only (else `GAME_ALREADY_STARTED`): picks / switches team. */
  'player:team': (p: PlayerTeamPayload, ack: (r: Ack) => void) => void;
  /** « Dessine-moi »: a guess (`text`); the ack tells whether it is right (`guess`). */
  'player:answer': (p: PlayerAnswerPayload, ack: (r: Ack<{ guess?: DrawGuess }>) => void) => void;
  /**
   * « Dessine-moi », the drawer during ANSWERING: stroke chunks, relayed to the TV
   * (`draw:strokes`). `GAME_PAUSED` while paused (the canvas freezes), `INVALID_PAYLOAD` for the
   * other players or a drawing over DRAW_MAX_STROKES / DRAW_MAX_POINTS.
   */
  'player:draw': (p: PlayerDrawPayload, ack: (r: Ack) => void) => void;
  /**
   * « Buzzer » question, ANSWERING: takes the hand (first one processed by the server wins),
   * which freezes the timer until the host judges. `BUZZER_TAKEN` (someone has the hand),
   * `ALREADY_ANSWERED` (out after a wrong answer), `FROZEN` (Gel), `GAME_PAUSED`, `NOT_ANSWERING`.
   */
  'player:buzz': (p: PlayerBuzzPayload, ack: (r: Ack) => void) => void;
  /**
   * Games with jokers: plays one joker of the hand on the current question (QUESTION_INTRO /
   * ANSWERING, before answering, not paused, one per question). `JOKER_REFUSED` otherwise (the
   * joker stays in hand). The server then sends `joker:used` to everyone and `joker:state`.
   */
  'player:joker': (p: PlayerJokerPayload, ack: (r: Ack) => void) => void;
  /**
   * « Survie »: a ghost with a haunt in stock gives a living player a Gel / Brouilleur for their
   * next question (any time between the start and the podium, not while paused). `JOKER_REFUSED`
   * otherwise (no haunt, target a ghost / oneself / already haunted that way), `GAME_PAUSED`.
   * The server then sends `joker:used` (`haunt: true`) and `survival:state`.
   */
  'player:haunt': (p: PlayerHauntPayload, ack: (r: Ack) => void) => void;
}

// ---------- Server → client payloads ----------

export interface GameStatePayload {
  phase: GamePhase;
  mode: GameMode;
  /** -1 in LOBBY. */
  questionIndex: number;
  totalQuestions: number;
  /**
   * Time left in the current timed phase (QUESTION_INTRO / ANSWERING), in ms. Avoids clock skew.
   * While paused: the frozen value.
   */
  remainingMs?: number;
  /** QUESTION_INTRO / ANSWERING only: the game is paused, the timer frozen (PLAN.md §2). */
  paused?: GamePause;
  /** The game is played with jokers. */
  jokers?: true;
  /** TV theme (T40): the start dialog's choice or the quiz's theme; absent = `classic`. */
  theme?: QuizTheme;
  /**
   * « Buzzer » question, ANSWERING: who has the hand (the timer is then frozen, `remainingMs` =
   * frozen value) and who answered wrong and can't buzz right now (emptied when everyone has).
   */
  buzzer?: BuzzerStatus;
  /**
   * « Dessine-moi » question (QUESTION_INTRO / ANSWERING): who draws and who already found the
   * word, in order (never what they typed).
   */
  draw?: DrawStatus;
}

export interface DrawStatus {
  /** Absent only when nobody could draw (no player left). */
  drawer?: LobbyMember;
  found: LobbyMember[];
}

export interface BuzzerStatus {
  holder?: LobbyMember;
  wrong: LobbyMember[];
}

/** « Survie », one player: hearts left (0 = 👻 ghost), haunts in stock. */
export interface SurvivalPlayer extends LobbyMember {
  hearts: number;
  /** Question index where the player lost their last heart (absent while alive). */
  eliminatedAt?: number;
  /** Question index where the player last lost a heart (absent if never). */
  lastLoss?: number;
  /** Ghost: haunts earned by correct answers and not used yet. */
  haunts?: number;
}

/**
 * « Survie », to everyone: hearts of every player (lobby included), re-sent after each reveal,
 * haunt, join, kick and in the rejoin resyncs.
 */
export interface SurvivalStatePayload {
  /** Hearts each player started with. */
  hearts: number;
  players: SurvivalPlayer[];
  /** Only one player (or nobody) is left alive: the next `host:next` after LEADERBOARD = PODIUM. */
  finished?: true;
}

export interface GamePause {
  /** Players who still have to answer and are offline (empty while resuming). */
  waitingFor: LobbyMember[];
  /** The host screen lost its connection. */
  hostMissing: boolean;
  /** How long the game has been paused, in ms. */
  sinceMs: number;
  /** « ⏸ Pause » pressed by the host (TV or remote): lasts until `host:resume`. */
  byHost?: true;
}

/**
 * « Télécommande » only (never the TV nor the phones), at each QUESTION_INTRO and in its resync:
 * the right answer of the current question, to read out discreetly.
 */
export interface RemoteAnswerPayload {
  index: number;
  /** `answerText` (« Dessine-moi »: the word drawn); [] for the types without a right answer. */
  answer: string[];
  /** PIN: the picture and its zone (drawn small on the remote). */
  pin?: { imageUrl: string; zone: PinZone };
  explanation?: string;
}

/** To the TV: how many remotes are paired and connected right now. */
export interface RemoteStatusPayload {
  remotes: number;
}

/** To the TV: a control pressed on the remote. */
export interface TvControlPayload {
  action: TvAction;
}

/** Everyone is back (or the host continued without them): resumes in `inMs` (3-2-1). */
export interface GameResumingPayload {
  inMs: number;
}

export interface LobbyPlayersPayload {
  /**
   * `teamId`: team mode, once the player has a team. `offline`: the player's phone lost the
   * connection (re-sent when it drops / comes back).
   */
  players: (LobbyMember & { teamId?: TeamId; offline?: true })[];
}

/**
 * Team mode only, to everyone: the teams and their members. In LOBBY every team of the game is
 * listed (empty ones too); from the start on, only the teams in play (those that had players).
 */
export interface LobbyTeamsPayload {
  teams: { id: TeamId; name: string; members: LobbyMember[] }[];
}

/** What a phone needs to draw a slider: never the correct value nor the margin. */
export type SliderPrompt = Pick<SliderSettings, 'min' | 'max' | 'step' | 'unit'>;

/**
 * « Mytho ! » on the TV: writing the lies, then voting among `options` (lies + the real answer,
 * shuffled — which one is true is only told at the reveal).
 */
export type BluffShow = { stage: 'write' } | { stage: 'vote'; options: string[] };

/**
 * « Mytho ! » on a phone. `write`: type a lie (`lie` = the one already sent, after a rejoin).
 * `vote`: tap one of `options` (same order as on the TV), never `own` (this player's lie).
 */
export type BluffPrompt =
  | { stage: 'write'; maxLength: number; lie?: string }
  | { stage: 'vote'; options: string[]; own?: number };

/** « Mytho ! » reveal: every answer offered, who wrote it and who voted for it. */
export interface BluffOption {
  text: string;
  truth: boolean;
  /** Players who wrote this lie (merged when they typed the same thing); empty for the truth. */
  authors: LobbyMember[];
  voters: LobbyMember[];
}

/** To the host only: full question (but not the answer, revealed by `question:reveal`). */
export interface QuestionShowPayload {
  index: number;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  /** Choice texts (MCQ, TRUE_FALSE, POLL); empty for TYPE_ANSWER / SLIDER. */
  choices: string[];
  timeLimitSec: number;
  /** SLIDER: the range shown during the question. */
  slider?: SliderPrompt;
  /** MCQ with 2+ right choices: « Plusieurs réponses possibles » (like the phones' prompt). */
  multiple?: true;
  /** Sound clip played by the host screen (never sent to the phones). */
  audio?: QuestionAudio;
  /** Play `audio` at REVEAL instead of during ANSWERING. */
  audioOnReveal?: true;
  /** Picture reveal effect (only with `imageUrl`; absent = none). */
  imageEffect?: Exclude<ImageEffect, 'none'>;
  /** BLUFF: current stage (re-sent when the vote starts). */
  bluff?: BluffShow;
  /** ORDER: the items, shuffled (never in the right order), as shown on the phones. */
  items?: string[];
  /** WHO_OF_US: the players one can vote for (everyone in the game). */
  candidates?: LobbyMember[];
  /**
   * « Buzzer »: the question is played with the buzzer (`choices` then empty). `answer` = the
   * right answer in words, for the host to judge (`buzzerAnswer`; the TV hides it until asked).
   */
  buzzer?: { answer: string[] };
  /** DRAW: who draws, and the word as blanks (`wordHint`) — never the word itself. */
  draw?: { drawer?: LobbyMember; hint: string };
}

/**
 * « Dessine-moi » on a phone: `word` for the drawer only (the others get the blanks), `maxLength`
 * of a guess.
 */
export interface DrawPrompt {
  drawer?: LobbyMember;
  word?: string;
  hint: string;
  maxLength: number;
}

/**
 * « Dessine-moi », to the host room (live) and to the drawer's phone (on rejoin): new stroke
 * chunks of question `index` (`mergeStrokes`); `clear` = start from an empty drawing (also used
 * to re-send the whole drawing).
 */
export interface DrawStrokesPayload {
  index: number;
  clear?: true;
  strokes: DrawStroke[];
}

/** To players only: never contains the question text or the correct answer. */
export interface QuestionPromptPayload {
  index: number;
  type: QuestionType;
  timeLimitSec: number;
  /** Choice types (MCQ, TRUE_FALSE, POLL): number of shape buttons. */
  choiceCount?: number;
  /**
   * MCQ with 2+ right choices (« select all », `isMultipleAnswer`): the shapes are toggles and the
   * answer is sent with « Valider » as `choiceIndexes` — never which ones nor how many are right.
   */
  multiple?: true;
  /** SLIDER: range of the slider. */
  slider?: SliderPrompt;
  /** TYPE_ANSWER / WORD_CLOUD: max length of the typed answer. */
  maxLength?: number;
  /** ORDER: the items to put in order, shuffled (same order as on the TV, never the answer). */
  items?: string[];
  /** PIN: the picture to tap (the only type whose phones get the picture; never the zone). */
  imageUrl?: string;
  /** WHO_OF_US: the players one can vote for (everyone in the game, oneself included). */
  candidates?: LobbyMember[];
  /** BLUFF: writing or voting (a new prompt, with `timeLimitSec` = vote time, starts the vote). */
  bluff?: BluffPrompt;
  /** « Buzzer »: one BUZZ button instead of the answer screen (no other field of the type). */
  buzzer?: true;
  /** DRAW: the canvas + the word (drawer), or the guess field (the others). */
  draw?: DrawPrompt;
}

export interface AnswerCountPayload {
  answered: number;
  total: number;
}

/** TYPE_ANSWER reveal: one group of typed answers (grouped after normalization). */
export interface TypedAnswerGroup {
  /** How the first player of the group typed it. */
  text: string;
  count: number;
  correct: boolean;
}

/** Type-specific part of a reveal, also saved in the game report (`QuestionResult.details`). */
export interface RevealDetails {
  /** TYPE_ANSWER: the accepted answers. */
  acceptedAnswers?: string[];
  /** TYPE_ANSWER: the most typed answers (top 6), most frequent first. */
  topAnswers?: TypedAnswerGroup[];
  /** SLIDER: the settings, correct value and margin included. */
  slider?: SliderSettings;
  /** SLIDER: every guess. */
  guesses?: number[];
  /**
   * SLIDER: the guess closest to the correct value (fastest one on a tie). `avatar` is absent in
   * games saved before avatars existed.
   */
  closest?: { nickname: string; value: number; avatar?: AvatarId };
  /** ORDER: the items in the right order, and per position how many players got it right. */
  order?: { items: string[]; placed: number[] };
  /** PIN: the picture, the correct zone and every player's pin (earliest first). */
  pin?: { imageUrl: string; zone: PinZone; pins: PinMark[] };
  /** WHO_OF_US: the players who got votes, most voted first (ties: by nickname). */
  votes?: VoteCount[];
  /** WHO_OF_US: the voters of the most voted player(s) got WHO_OF_US_MAJORITY_BONUS. */
  majorityBonus?: true;
  /** WORD_CLOUD: the words typed (grouped after normalization), most frequent first (top 40). */
  words?: { text: string; count: number }[];
  /**
   * BLUFF: the real answer and every option, in the order they will be revealed (the lies that
   * fooled the fewest players first, the truth last).
   */
  bluff?: { truth: string; options: BluffOption[] };
  /** « Buzzer »: the right answer, who found it (absent: nobody) and who answered wrong, in order. */
  buzzer?: BuzzerReveal;
  /** DRAW: the word, the drawer, the whole drawing (vector) and who found it, fastest first. */
  draw?: DrawReveal;
  /** « Select all » MCQ: how many players ticked exactly the right choices. */
  multiple?: { allFound: number };
}

export interface DrawReveal {
  word: string;
  drawer?: LobbyMember;
  strokes: DrawStroke[];
  /** `ms` = time taken to find (pauses excluded). */
  found: (LobbyMember & { ms: number })[];
}

export interface BuzzerReveal {
  answer: string[];
  winner?: LobbyMember;
  wrong: LobbyMember[];
}

export interface PinMark extends PinPoint {
  nickname: string;
  avatar: AvatarId;
  /** Inside the zone. */
  correct: boolean;
}

export interface VoteCount {
  nickname: string;
  avatar: AvatarId;
  count: number;
}

export interface QuestionRevealPayload extends RevealDetails {
  type: QuestionType;
  /** Correct choice indexes (empty for POLL, TYPE_ANSWER and SLIDER). */
  correctIndexes: number[];
  /**
   * Number of players who picked each choice index (empty for TYPE_ANSWER / SLIDER). « Select
   * all »: every ticked choice counts (a player can be in several bars).
   */
  distribution: number[];
  /** « 💡 Le saviez-vous ? »: the question's explanation (never sent before the reveal). */
  explanation?: string;
  /** SLIDER: same as `slider.correct` / `slider.margin`. */
  correct?: number;
  margin?: number;
}

export interface PlayerResultPayload {
  correct: boolean;
  /** Includes `streakBonus`. */
  pointsEarned: number;
  /** Consecutive correct answers including this one; 0 if wrong / no answer. */
  streak: number;
  /** Streak bonus already included in `pointsEarned` (PLAN.md §3). */
  streakBonus: number;
  totalScore: number;
  rank: number;
  /** Team mode: the player's team after this question (score = sum of averages, PLAN.md §3). */
  team?: { id: TeamId; score: number; rank: number };
  /**
   * POLL, WHO_OF_US, WORD_CLOUD: no right or wrong (`correct` false, streak unchanged; 0 points
   * except the WHO_OF_US majority bonus).
   */
  poll?: true;
  /** SLIDER: the player's guess (absent without an answer) and the correct value. */
  yourValue?: number;
  correctValue?: number;
  /**
   * Games with jokers: what jokers did to this player on this question (included in
   * `pointsEarned`, which can then be negative: Double ou rien lost, Voleur victim).
   */
  jokers?: JokerResult[];
  /**
   * ORDER: how many items the player put in the right place (absent without an answer). Partial
   * points: `pointsEarned` can be > 0 with `correct` false.
   */
  placed?: { correct: number; total: number };
  /**
   * « Survie »: hearts left after this question, whether one was lost, `eliminated` = the last
   * one was lost just now (the player is now a ghost), `hauntEarned` = a ghost's correct answer.
   */
  survival?: {
    hearts: number;
    lostHeart: boolean;
    eliminated?: true;
    ghost?: true;
    hauntEarned?: true;
  };
  /** WHO_OF_US: votes the player got, and whether they voted for the most voted player. */
  votesReceived?: number;
  withMajority?: boolean;
  /**
   * BLUFF: `found` the truth; the players `fooled` by your lie and the points they earned you
   * (included in `pointsEarned`); `fellFor` = authors of the lie you voted for.
   */
  bluff?: {
    truth: string;
    found: boolean;
    lie?: string;
    fooled: LobbyMember[];
    fooledPoints: number;
    fellFor?: LobbyMember[];
  };
  /**
   * « Buzzer »: the right answer, `won` (this player found it), `wrong` (buzzed and answered
   * wrong), `winner` (whoever found it, absent: nobody).
   */
  buzzer?: { answer: string[]; won: boolean; wrong: boolean; winner?: LobbyMember };
  /**
   * DRAW: the word; `drew` = this player was the drawer (streak unchanged; `pointsEarned` =
   * DRAW_FINDER_SHARE × basePoints per finder); `finders` = players who found it.
   */
  draw?: { word: string; drawer?: LobbyMember; drew: boolean; found: boolean; finders: number };
  /**
   * « Select all » MCQ: the right choices (« Il fallait cocher : … ») and the player's ticks
   * (absent without an answer).
   */
  multiple?: { correctIndexes: number[]; yours?: number[] };
  /** « 💡 Le saviez-vous ? »: the question's explanation. */
  explanation?: string;
}

/** What a joker does to one phone's controls on the current question (that phone only). */
export interface JokerEffects {
  /** 50/50, choice questions: choice indexes to hide (wrong ones only). */
  hiddenChoices?: number[];
  /** 50/50, SLIDER: a narrower range that contains the answer. */
  sliderRange?: { min: number; max: number };
  /** 50/50, TYPE_ANSWER: first letter of the expected answer. */
  firstLetter?: string;
  /** Gel: answers refused during the first `ms` of ANSWERING (pauses excluded). */
  frozen?: { ms: number; by: LobbyMember };
  /** Brouilleur: grey buttons in this order, labelled with the choice texts (read the TV). */
  scrambled?: { by: LobbyMember; choices: { index: number; text: string }[] };
  /** Copieur: the target answered, so did you (copied answer, not shown). */
  copied?: true;
}

/** To each player of a game with jokers: their hand and what jokers do to them right now. */
export interface PlayerJokersPayload {
  /** Question these effects / `played` refer to (-1 in LOBBY). */
  questionIndex: number;
  /** Its type, so the phone greys out the jokers it doesn't take (`jokerAvailability`). */
  questionType?: QuestionType;
  /** The question is a « Buzzer » one: no joker (`jokerAvailability(type, true)`). */
  buzzer?: true;
  hand: JokerType[];
  /** Joker played on `questionIndex`, with its target (Copieur, Gel, Brouilleur, Voleur). */
  played?: { joker: JokerType; target?: LobbyMember };
  /** A Bouclier is armed: it blocks the next attack aimed at this player. */
  shield?: true;
  /** The other players (possible targets), with their team in team mode. */
  others: (LobbyMember & { teamId?: TeamId })[];
  /** Ids of the players already attacked on this question (one attack per target). */
  attacked: string[];
  effects: JokerEffects;
}

/** To everyone (big announcement on the TV): someone played a joker. */
export interface JokerUsedPayload {
  questionIndex: number;
  joker: JokerType;
  by: LobbyMember;
  /** Gel, Brouilleur, Voleur (never Copieur: whom you copy stays secret). */
  target?: LobbyMember;
  /** The target's Bouclier blocked this attack. */
  blocked?: true;
  /** « Survie »: a ghost's free Gel / Brouilleur (not taken from a hand). */
  haunt?: true;
}

/** What jokers changed for one player at the reveal (`player:result.jokers`). */
export type JokerResult =
  | { kind: 'double'; points: number } // right answer, `points` = extra points (×2)
  | { kind: 'doubleLost'; points: number } // wrong / no answer, `points` = points lost (≤ 500)
  | { kind: 'shieldSaved' } // wrong answer, the streak was kept
  | { kind: 'stole'; points: number; player: LobbyMember }
  | { kind: 'stolen'; points: number; player: LobbyMember }
  | { kind: 'copied'; player: LobbyMember }
  | { kind: 'copyMissed'; player: LobbyMember }
  | { kind: 'hourglass'; points: number } // extra points thanks to the Sablier
  | { kind: 'earned'; joker: JokerType }; // new joker for a streak of 3, 6, 9…

export interface ServerToClientEvents {
  'game:state': (p: GameStatePayload) => void; // all
  'game:resuming': (p: GameResumingPayload) => void; // all
  'lobby:players': (p: LobbyPlayersPayload) => void; // host
  'lobby:teams': (p: LobbyTeamsPayload) => void; // all (team mode)
  'question:show': (p: QuestionShowPayload) => void; // host
  'question:prompt': (p: QuestionPromptPayload) => void; // players
  'answer:count': (p: AnswerCountPayload) => void; // host
  'question:reveal': (p: QuestionRevealPayload) => void; // host
  'player:result': (p: PlayerResultPayload) => void; // each player
  leaderboard: (p: StandingsPayload) => void; // host
  podium: (p: StandingsPayload) => void; // all
  'player:kicked': (p: Record<string, never>) => void; // that player
  'joker:state': (p: PlayerJokersPayload) => void; // each player (games with jokers)
  'joker:used': (p: JokerUsedPayload) => void; // all (games with jokers, « Survie » haunts)
  'survival:state': (p: SurvivalStatePayload) => void; // all (« Survie »)
  'draw:strokes': (p: DrawStrokesPayload) => void; // host (+ the drawer on rejoin)
  'remote:answer': (p: RemoteAnswerPayload) => void; // remotes only
  'remote:revoked': (p: Record<string, never>) => void; // remotes only (then dropped)
  'remote:status': (p: RemoteStatusPayload) => void; // host room
  'tv:control': (p: TvControlPayload) => void; // the TV sockets only
  error: (p: ErrorPayload) => void; // sender
}

// ---------- Room names ----------

export const roomAll = (pin: string) => `game:${pin}`;
export const roomHost = (pin: string) => `game:${pin}:host`;
