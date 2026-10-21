import type {
  GameMode,
  GamePhase,
  GameStatePayload,
  LobbyPlayersPayload,
  LobbyTeamsPayload,
  QuestionRevealPayload,
  QuestionShowPayload,
  RankedPlayer,
  RankedTeam,
  StandingsPayload,
} from '@lbq/shared';

/** Everything the shared screen knows about the game, folded from server events. */
export interface HostGameState {
  /** null until the first `game:state` arrives. */
  phase: GamePhase | null;
  mode: GameMode;
  questionIndex: number;
  totalQuestions: number;
  /** Local timestamp (ms) when the current timed phase ends, derived from `remainingMs`. */
  deadline: number | null;
  players: LobbyPlayersPayload['players'];
  /** Team mode: teams and their members (`lobby:teams`). */
  teams: LobbyTeamsPayload['teams'];
  /** Last `question:show`; only valid when `question.index === questionIndex`. */
  question: QuestionShowPayload | null;
  answered: number;
  answerTotal: number;
  reveal: QuestionRevealPayload | null;
  leaderboard: RankedPlayer[];
  /** Leaderboard before the current one (animates the re-ordering); [] after a reload. */
  previousLeaderboard: RankedPlayer[];
  /** `questionIndex` the current `leaderboard` was received for (-1: none yet). */
  leaderboardFor: number;
  /** Team mode: team ranking of the current leaderboard. */
  leaderboardTeams: RankedTeam[];
  podium: RankedPlayer[];
  podiumTeams: RankedTeam[];
}

export type HostAction =
  | { type: 'state'; payload: GameStatePayload; now: number }
  | { type: 'players'; payload: LobbyPlayersPayload }
  | { type: 'teams'; payload: LobbyTeamsPayload }
  | { type: 'question'; payload: QuestionShowPayload }
  | { type: 'count'; answered: number; total: number }
  | { type: 'reveal'; payload: QuestionRevealPayload }
  | ({ type: 'leaderboard' } & StandingsPayload)
  | ({ type: 'podium' } & StandingsPayload);

export const initialHostState: HostGameState = {
  phase: null,
  mode: 'solo',
  questionIndex: -1,
  totalQuestions: 0,
  deadline: null,
  players: [],
  teams: [],
  question: null,
  answered: 0,
  answerTotal: 0,
  reveal: null,
  leaderboard: [],
  previousLeaderboard: [],
  leaderboardFor: -1,
  leaderboardTeams: [],
  podium: [],
  podiumTeams: [],
};

export function hostReducer(state: HostGameState, action: HostAction): HostGameState {
  switch (action.type) {
    case 'state': {
      const { phase, mode, questionIndex, totalQuestions, remainingMs } = action.payload;
      const newQuestion = questionIndex !== state.questionIndex;
      return {
        ...state,
        phase,
        mode,
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
    case 'teams':
      return { ...state, teams: action.payload.teams };
    case 'question':
      return { ...state, question: action.payload };
    case 'count':
      return { ...state, answered: action.answered, answerTotal: action.total };
    case 'reveal':
      return { ...state, reveal: action.payload };
    case 'leaderboard':
      // A host resync re-sends the same question's leaderboard: keep the real previous one.
      if (state.leaderboardFor === state.questionIndex)
        return { ...state, leaderboard: action.top, leaderboardTeams: action.teams ?? [] };
      return {
        ...state,
        previousLeaderboard: state.leaderboard,
        leaderboard: action.top,
        leaderboardFor: state.questionIndex,
        leaderboardTeams: action.teams ?? [],
      };
    case 'podium':
      return { ...state, podium: action.top, podiumTeams: action.teams ?? [] };
  }
}

/** The question for the current index, or null if `question:show` hasn't arrived yet. */
export function currentQuestion(state: HostGameState): QuestionShowPayload | null {
  return state.question?.index === state.questionIndex ? state.question : null;
}

/**
 * Team mode, lobby: can the game start? Every player in a team and at least 2 teams with
 * players (the server checks it too). `unbalanced`: a team has more than twice as many players
 * as another one (only a hint: the team score is an average, so it stays fair).
 */
export function teamLobbyStatus(state: Pick<HostGameState, 'players' | 'teams'>): {
  ready: boolean;
  unassigned: number;
  unbalanced: boolean;
} {
  const sizes = state.teams.map((t) => t.members.length).filter((n) => n > 0);
  const unassigned = state.players.filter((p) => p.teamId === undefined).length;
  return {
    ready: state.players.length > 0 && unassigned === 0 && sizes.length >= 2,
    unassigned,
    unbalanced: sizes.length >= 2 && Math.max(...sizes) > 2 * Math.min(...sizes),
  };
}

export function isLastQuestion(state: HostGameState): boolean {
  return state.questionIndex >= state.totalQuestions - 1;
}
