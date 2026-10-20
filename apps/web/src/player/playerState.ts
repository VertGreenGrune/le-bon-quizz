import type {
  ErrorCode,
  GameMode,
  GamePhase,
  GameStatePayload,
  LobbyTeamsPayload,
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
  /** Choice the player tapped, for `questionIndex` only. */
  myAnswer: { questionIndex: number; choiceIndex: number } | null;
  result: (PlayerResultPayload & { questionIndex: number }) | null;
  nickname: string;
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
}

export type PlayerAction =
  | { type: 'connection'; connected: boolean }
  | { type: 'session'; playerId: string; nickname: string; totalScore: number }
  | { type: 'teams'; payload: LobbyTeamsPayload }
  | { type: 'state'; payload: GameStatePayload; now: number }
  | { type: 'prompt'; payload: QuestionPromptPayload; now: number }
  | { type: 'answer'; questionIndex: number; choiceIndex: number }
  | { type: 'answerRejected'; questionIndex: number }
  | { type: 'result'; payload: PlayerResultPayload }
  | { type: 'podium'; top: RankedPlayer[]; teams?: RankedTeam[] }
  | { type: 'kicked' }
  | { type: 'lost'; code: ErrorCode };

export const initialPlayerState: PlayerState = {
  connected: false,
  phase: null,
  mode: 'solo',
  questionIndex: -1,
  totalQuestions: 0,
  prompt: null,
  answeringEndsAt: null,
  myAnswer: null,
  result: null,
  nickname: '',
  playerId: '',
  totalScore: 0,
  teams: [],
  podium: null,
  podiumTeams: [],
  kicked: false,
  lost: null,
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
        totalScore: action.totalScore,
      };

    case 'teams':
      return { ...state, teams: action.payload.teams };

    case 'state': {
      const { phase, mode, questionIndex, totalQuestions, remainingMs } = action.payload;
      const sameQuestion = questionIndex === state.questionIndex;
      let answeringEndsAt = sameQuestion ? state.answeringEndsAt : null;
      if (phase === 'ANSWERING' && remainingMs !== undefined) {
        answeringEndsAt = action.now + remainingMs;
      }
      return {
        ...state,
        phase,
        mode,
        questionIndex,
        totalQuestions,
        answeringEndsAt,
        prompt: state.prompt?.index === questionIndex ? state.prompt : null,
        myAnswer: state.myAnswer?.questionIndex === questionIndex ? state.myAnswer : null,
        // Keep the last result through LEADERBOARD / PODIUM; drop it once a new question starts.
        result: sameQuestion || phase === 'PODIUM' || phase === 'ENDED' ? state.result : null,
      };
    }

    case 'prompt': {
      const p = action.payload;
      const isCurrent = p.index === state.questionIndex;
      return {
        ...state,
        prompt: p,
        questionIndex: p.index,
        // `game:state` remainingMs is more accurate; fall back to the full time limit.
        answeringEndsAt:
          isCurrent && state.answeringEndsAt !== null
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
        myAnswer: { questionIndex: action.questionIndex, choiceIndex: action.choiceIndex },
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

const errorMessages: Partial<Record<ErrorCode, string>> = {
  GAME_NOT_FOUND: 'Aucune partie avec ce code PIN.',
  GAME_ALREADY_STARTED: 'La partie a déjà commencé.',
  GAME_FULL: 'La partie est complète.',
  NICKNAME_TAKEN: 'Ce pseudo est déjà pris, choisis-en un autre.',
  INVALID_PAYLOAD: 'Code PIN ou pseudo invalide.',
  SESSION_NOT_FOUND: 'Ta session a expiré.',
};

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
