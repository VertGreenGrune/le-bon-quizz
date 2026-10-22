import type {
  AnswerInput,
  AvatarId,
  ErrorCode,
  GameMode,
  GamePause,
  GamePhase,
  GameStatePayload,
  JokerUsedPayload,
  LobbyTeamsPayload,
  PlayerJokersPayload,
  PlayerResultPayload,
  QuestionPromptPayload,
  RankedPlayer,
  RankedTeam,
} from '@lbq/shared';

/** Everything the phone knows about the game. Pure data, driven by server events. */
export interface PlayerState {
  connected: boolean;
  /** null until the first `game:state` arrives (after join / rejoin). */
  phase: GamePhase | null;
  mode: GameMode;
  questionIndex: number;
  totalQuestions: number;
  prompt: QuestionPromptPayload | null;
  /** Local-clock deadline of the ANSWERING phase (derived from `remainingMs`, no clock skew). */
  answeringEndsAt: number | null;
  /** The game is paused (someone lost the connection): timer frozen. */
  paused: GamePause | null;
  /** While paused: the frozen time left in the phase. */
  frozenMs: number | null;
  /** Local-clock end of the 3-2-1 countdown before resuming (`game:resuming`). */
  resumeAt: number | null;
  /** What the player answered (choice, text or slider value), for `questionIndex` only. */
  myAnswer: ({ questionIndex: number } & AnswerInput) | null;
  result: (PlayerResultPayload & { questionIndex: number }) | null;
  nickname: string;
  /** Own avatar (null until known: old session without it). */
  avatar: AvatarId | null;
  /** Own player id, to find our team in `teams`. */
  playerId: string;
  totalScore: number;
  /** Team mode: teams and their members (`lobby:teams`). */
  teams: LobbyTeamsPayload['teams'];
  podium: RankedPlayer[] | null;
  podiumTeams: RankedTeam[];
  kicked: boolean;
  /** Fatal: the session can't be resumed (game gone, unknown token…). */
  lost: ErrorCode | null;
  /** The game is played with jokers (`game:state.jokers`). */
  jokerGame: boolean;
  /** Own jokers: hand + effects on the current question (`joker:state`). */
  jokers: PlayerJokersPayload | null;
  /** Last joker played by anyone (toast), with the local time it arrived. */
  jokerNews: (JokerUsedPayload & { at: number }) | null;
}

export type PlayerAction =
  | { type: 'connection'; connected: boolean }
  | {
      type: 'session';
      playerId: string;
      nickname: string;
      avatar?: AvatarId;
      totalScore: number;
    }
  | { type: 'teams'; payload: LobbyTeamsPayload }
  | { type: 'state'; payload: GameStatePayload; now: number }
  | { type: 'resuming'; inMs: number; now: number }
  | { type: 'prompt'; payload: QuestionPromptPayload; now: number }
  | { type: 'answer'; questionIndex: number; answer: AnswerInput }
  | { type: 'answerRejected'; questionIndex: number }
  | { type: 'result'; payload: PlayerResultPayload }
  | { type: 'podium'; top: RankedPlayer[]; teams?: RankedTeam[] }
  | { type: 'kicked' }
  | { type: 'lost'; code: ErrorCode }
  | { type: 'jokers'; payload: PlayerJokersPayload }
  | { type: 'jokerUsed'; payload: JokerUsedPayload; now: number };

export const initialPlayerState: PlayerState = {
  connected: false,
  phase: null,
  mode: 'solo',
  questionIndex: -1,
  totalQuestions: 0,
  prompt: null,
  answeringEndsAt: null,
  paused: null,
  frozenMs: null,
  resumeAt: null,
  myAnswer: null,
  result: null,
  nickname: '',
  avatar: null,
  playerId: '',
  totalScore: 0,
  teams: [],
  podium: null,
  podiumTeams: [],
  kicked: false,
  lost: null,
  jokerGame: false,
  jokers: null,
  jokerNews: null,
};

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'connection':
      return { ...state, connected: action.connected };

    case 'session':
      return {
        ...state,
        playerId: action.playerId,
        nickname: action.nickname,
        avatar: action.avatar ?? state.avatar,
        totalScore: action.totalScore,
      };

    case 'teams':
      return { ...state, teams: action.payload.teams };

    case 'state': {
      const { phase, mode, questionIndex, totalQuestions, remainingMs } = action.payload;
      const paused = action.payload.paused ?? null;
      const sameQuestion = questionIndex === state.questionIndex;
      let answeringEndsAt = sameQuestion ? state.answeringEndsAt : null;
      if (phase === 'ANSWERING' && remainingMs !== undefined && !paused) {
        answeringEndsAt = action.now + remainingMs;
      }
      // Someone (still / again) missing: no countdown. Everyone back: keep the countdown.
      const waiting = paused && (paused.waitingFor.length > 0 || paused.hostMissing);
      return {
        ...state,
        paused,
        frozenMs: paused ? (remainingMs ?? null) : null,
        resumeAt: paused && !waiting ? state.resumeAt : null,
        phase,
        mode,
        jokerGame: !!action.payload.jokers,
        questionIndex,
        totalQuestions,
        answeringEndsAt,
        prompt: state.prompt?.index === questionIndex ? state.prompt : null,
        myAnswer: state.myAnswer?.questionIndex === questionIndex ? state.myAnswer : null,
        // Keep the last result through LEADERBOARD / PODIUM; drop it once a new question starts.
        result: sameQuestion || phase === 'PODIUM' || phase === 'ENDED' ? state.result : null,
      };
    }

    case 'resuming':
      return state.paused ? { ...state, resumeAt: action.now + action.inMs } : state;

    case 'prompt': {
      const p = action.payload;
      const isCurrent = p.index === state.questionIndex;
      return {
        ...state,
        prompt: p,
        questionIndex: p.index,
        // `game:state` remainingMs is more accurate; fall back to the full time limit.
        answeringEndsAt:
          isCurrent && (state.answeringEndsAt !== null || state.paused)
            ? state.answeringEndsAt
            : action.now + p.timeLimitSec * 1000,
        myAnswer: state.myAnswer?.questionIndex === p.index ? state.myAnswer : null,
        result: isCurrent ? state.result : null,
      };
    }

    case 'answer':
      if (state.myAnswer?.questionIndex === action.questionIndex) return state; // one answer only
      return {
        ...state,
        myAnswer: { questionIndex: action.questionIndex, ...action.answer },
      };

    case 'answerRejected':
      return state.myAnswer?.questionIndex === action.questionIndex
        ? { ...state, myAnswer: null }
        : state;

    case 'result':
      return {
        ...state,
        result: { ...action.payload, questionIndex: state.questionIndex },
        totalScore: action.payload.totalScore,
      };

    case 'podium':
      return { ...state, podium: action.top, podiumTeams: action.teams ?? [] };

    case 'kicked':
      return { ...state, kicked: true };

    case 'lost':
      return { ...state, lost: action.code };

    case 'jokers':
      return { ...state, jokers: action.payload };

    case 'jokerUsed':
      return { ...state, jokerNews: { ...action.payload, at: action.now } };
  }
}

/** Team mode: the team the player is in, if any. */
export function myTeam(s: PlayerState): LobbyTeamsPayload['teams'][number] | null {
  return s.teams.find((t) => t.members.some((m) => m.id === s.playerId)) ?? null;
}

/** Which screen the phone should show. */
export type PlayerScreen =
  | 'connecting'
  | 'lobby'
  | 'getReady'
  | 'answer'
  | 'answered'
  | 'result'
  | 'waitingResult'
  | 'standings'
  | 'podium'
  | 'ended'
  | 'kicked'
  | 'lost';

export function playerScreen(s: PlayerState): PlayerScreen {
  if (s.kicked) return 'kicked';
  if (s.lost) return 'lost';
  switch (s.phase) {
    case null:
      return 'connecting';
    case 'LOBBY':
      return 'lobby';
    case 'QUESTION_INTRO':
      return 'getReady';
    case 'ANSWERING':
      if (s.myAnswer?.questionIndex === s.questionIndex) return 'answered';
      return s.prompt?.index === s.questionIndex ? 'answer' : 'getReady';
    case 'REVEAL':
      return s.result ? 'result' : 'waitingResult';
    case 'LEADERBOARD':
      return 'standings';
    case 'PODIUM':
      return 'podium';
    case 'ENDED':
      return 'ended';
  }
}

/** Effects of the jokers on the current question (empty when none / another question). */
export function jokerEffects(s: PlayerState): NonNullable<PlayerJokersPayload['effects']> {
  return s.jokers?.questionIndex === s.questionIndex ? s.jokers.effects : {};
}

/** Copieur played on this question and the copy hasn't happened yet: no buttons. */
export function copyingTarget(s: PlayerState) {
  const j = s.jokers;
  if (!j || j.questionIndex !== s.questionIndex || j.played?.joker !== 'copy') return null;
  return j.effects.copied ? null : (j.played.target ?? null);
}

const errorMessages: Partial<Record<ErrorCode, string>> = {
  GAME_NOT_FOUND: 'Aucune partie avec ce code PIN.',
  GAME_ALREADY_STARTED: 'La partie a déjà commencé.',
  GAME_FULL: 'La partie est complète.',
  NICKNAME_TAKEN: 'Ce pseudo est déjà pris, choisis-en un autre.',
  INVALID_PAYLOAD: 'Code PIN ou pseudo invalide.',
  SESSION_NOT_FOUND: 'Ta session a expiré.',
  GAME_PAUSED: 'Partie en pause : attends la reprise.',
};

/** Join screen, game already started: only a disconnected player's place can be taken. */
export function reclaimErrorMessage(code: ErrorCode | 'TIMEOUT'): string {
  if (code === 'GAME_ALREADY_STARTED')
    return 'Aucun joueur déconnecté ne porte ce pseudo dans cette partie. Vérifie l’orthographe.';
  if (code === 'NICKNAME_TAKEN') return 'Ce joueur est encore connecté à la partie.';
  return errorMessage(code);
}

/** Pause screen text: who the game is waiting for. */
export function pauseWaitingText(paused: GamePause): string {
  const names = paused.waitingFor.map((p) => p.nickname);
  if (paused.hostMissing) names.push("l'écran de l'animateur");
  if (names.length === 0) return 'Tout le monde est là !';
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
  return `On attend ${list}…`;
}

/** French UI message for a server error code. */
export function errorMessage(code: ErrorCode | 'TIMEOUT'): string {
  if (code === 'TIMEOUT') return 'Le serveur ne répond pas. Vérifie ta connexion.';
  return errorMessages[code] ?? 'Une erreur est survenue.';
}

/** Keeps only digits, capped at the PIN length. */
export function normalizePin(input: string, length: number): string {
  return input.replace(/\D/g, '').slice(0, length);
}

/** "1er", "2e", "3e"… — `feminine` for a team (« l'équipe est 1re »). */
export function formatRank(rank: number, feminine = false): string {
  return rank === 1 ? (feminine ? '1re' : '1er') : `${rank}e`;
}
