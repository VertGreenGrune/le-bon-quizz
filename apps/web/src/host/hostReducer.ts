import type {
  GamePhase,
  GameStatePayload,
  LobbyPlayersPayload,
  QuestionRevealPayload,
  QuestionShowPayload,
  RankedPlayer,
} from '@lbq/shared';

/** Everything the shared screen knows about the game, folded from server events. */
export interface HostGameState {
  /** null until the first `game:state` arrives. */
  phase: GamePhase | null;
  questionIndex: number;
  totalQuestions: number;
  /** Local timestamp (ms) when the current timed phase ends, derived from `remainingMs`. */
  deadline: number | null;
  players: LobbyPlayersPayload['players'];
  /** Last `question:show`; only valid when `question.index === questionIndex`. */
  question: QuestionShowPayload | null;
  answered: number;
  answerTotal: number;
  reveal: QuestionRevealPayload | null;
  leaderboard: RankedPlayer[];
  podium: RankedPlayer[];
}

export type HostAction =
  | { type: 'state'; payload: GameStatePayload; now: number }
  | { type: 'players'; payload: LobbyPlayersPayload }
  | { type: 'question'; payload: QuestionShowPayload }
  | { type: 'count'; answered: number; total: number }
  | { type: 'reveal'; payload: QuestionRevealPayload }
  | { type: 'leaderboard'; top: RankedPlayer[] }
  | { type: 'podium'; top: RankedPlayer[] };

export const initialHostState: HostGameState = {
  phase: null,
  questionIndex: -1,
  totalQuestions: 0,
  deadline: null,
  players: [],
  question: null,
  answered: 0,
  answerTotal: 0,
  reveal: null,
  leaderboard: [],
  podium: [],
};

export function hostReducer(state: HostGameState, action: HostAction): HostGameState {
  switch (action.type) {
    case 'state': {
      const { phase, questionIndex, totalQuestions, remainingMs } = action.payload;
      const newQuestion = questionIndex !== state.questionIndex;
      return {
        ...state,
        phase,
        questionIndex,
        totalQuestions,
        deadline: remainingMs != null ? action.now + remainingMs : null,
        // Per-question data from the previous question must not leak into the next one.
        ...(newQuestion && {
          answered: 0,
          answerTotal: state.players.length,
          reveal: null,
        }),
      };
    }
    case 'players':
      return { ...state, players: action.payload.players };
    case 'question':
      return { ...state, question: action.payload };
    case 'count':
      return { ...state, answered: action.answered, answerTotal: action.total };
    case 'reveal':
      return { ...state, reveal: action.payload };
    case 'leaderboard':
      return { ...state, leaderboard: action.top };
    case 'podium':
      return { ...state, podium: action.top };
  }
}

/** The question for the current index, or null if `question:show` hasn't arrived yet. */
export function currentQuestion(state: HostGameState): QuestionShowPayload | null {
  return state.question?.index === state.questionIndex ? state.question : null;
}

export function isLastQuestion(state: HostGameState): boolean {
  return state.questionIndex >= state.totalQuestions - 1;
}
