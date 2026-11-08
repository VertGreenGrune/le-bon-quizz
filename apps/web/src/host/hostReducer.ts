import {
  mergeStrokes,
  type BuzzerStatus,
  type DrawStatus,
  type DrawStroke,
  type DrawStrokesPayload,
  type GameMode,
  type QuizTheme,
  type GamePause,
  type GamePhase,
  type LobbyMember,
  type GameStatePayload,
  type LobbyPlayersPayload,
  type LobbyTeamsPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type RankedPlayer,
  type RankedTeam,
  type StandingsPayload,
  type SurvivalStatePayload,
} from '@lbq/shared';

/** Everything the shared screen knows about the game, folded from server events. */
export interface HostGameState {
  /** null until the first `game:state` arrives. */
  phase: GamePhase | null;
  /** « Quiz suivant » (T47): number of the quiz played in this room (1 = the first one). */
  round: number;
  /** From the second quiz of the room on: its title. */
  quizTitle: string | null;
  mode: GameMode;
  /** TV theme (T40, `game:state.theme`). */
  theme: QuizTheme;
  /** The game is played with jokers. */
  jokers: boolean;
  questionIndex: number;
  totalQuestions: number;
  /** Local timestamp (ms) when the current timed phase ends, derived from `remainingMs`. */
  deadline: number | null;
  /** QUESTION_INTRO: its whole duration (`game:state.introMs`, T42), null otherwise. */
  introMs: number | null;
  /** The game is paused (a player / the host screen lost the connection): timer frozen. */
  paused: GamePause | null;
  /** While paused: the frozen time left and the local time the pause started at. */
  frozenMs: number | null;
  pausedSince: number | null;
  /** Local end of the 3-2-1 countdown before resuming (`game:resuming`). */
  resumeAt: number | null;
  /**
   * « Buzzer » question (`game:state.buzzer`): who has the hand — the timer is then frozen at
   * `frozenMs` — and who answered wrong.
   */
  buzzer: BuzzerStatus | null;
  /** « Dessine-moi » question (`game:state.draw`): who draws, who already found the word. */
  draw: DrawStatus | null;
  /** « Dessine-moi »: the live drawing of question `index` (`draw:strokes`). */
  drawing: { index: number; strokes: DrawStroke[] };
  /** Players who just came back online (« <pseudo> est de retour ! »), with the local time. */
  comebacks: (LobbyMember & { at: number })[];
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
  /** « Survie »: everyone's hearts (`survival:state`). */
  survival: SurvivalStatePayload | null;
}

export type HostAction =
  | { type: 'state'; payload: GameStatePayload; now: number }
  | { type: 'players'; payload: LobbyPlayersPayload; now: number }
  | { type: 'resuming'; inMs: number; now: number }
  | { type: 'teams'; payload: LobbyTeamsPayload }
  | { type: 'question'; payload: QuestionShowPayload }
  | { type: 'count'; answered: number; total: number }
  | { type: 'reveal'; payload: QuestionRevealPayload }
  | ({ type: 'leaderboard' } & StandingsPayload)
  | ({ type: 'podium' } & StandingsPayload)
  | { type: 'survival'; payload: SurvivalStatePayload }
  | { type: 'drawStrokes'; payload: DrawStrokesPayload };

export const initialHostState: HostGameState = {
  phase: null,
  round: 1,
  quizTitle: null,
  mode: 'solo',
  theme: 'classic',
  jokers: false,
  questionIndex: -1,
  totalQuestions: 0,
  deadline: null,
  introMs: null,
  paused: null,
  frozenMs: null,
  pausedSince: null,
  resumeAt: null,
  buzzer: null,
  draw: null,
  drawing: { index: -1, strokes: [] },
  comebacks: [],
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
  survival: null,
};

export function hostReducer(state: HostGameState, action: HostAction): HostGameState {
  switch (action.type) {
    case 'state': {
      const round = action.payload.round ?? 1;
      // « Quiz suivant » (T47): a new quiz in the same room — nothing of the previous one stays
      // (the lobby players / teams are re-sent right after, keep them meanwhile).
      if (round !== state.round)
        state = {
          ...initialHostState,
          round,
          players: state.players,
          teams: state.teams,
          comebacks: state.comebacks,
        };
      const { phase, mode, questionIndex, totalQuestions, remainingMs } = action.payload;
      const newQuestion = questionIndex !== state.questionIndex;
      const paused = action.payload.paused ?? null;
      const waiting = paused && (paused.waitingFor.length > 0 || paused.hostMissing);
      const buzzer = action.payload.buzzer ?? null;
      // Paused, or a player answering out loud (« Buzzer »): the clock is frozen.
      const frozen = !!paused || !!buzzer?.holder;
      return {
        ...state,
        phase,
        mode,
        quizTitle: action.payload.quizTitle ?? null,
        theme: action.payload.theme ?? 'classic',
        jokers: !!action.payload.jokers,
        questionIndex,
        totalQuestions,
        deadline: remainingMs != null && !frozen ? action.now + remainingMs : null,
        introMs: action.payload.introMs ?? null,
        paused,
        buzzer,
        draw: action.payload.draw ?? null,
        frozenMs: frozen ? (remainingMs ?? null) : null,
        pausedSince: paused ? action.now - paused.sinceMs : null,
        resumeAt: paused && !waiting ? state.resumeAt : null,
        // Per-question data from the previous question must not leak into the next one.
        ...(newQuestion && {
          answered: 0,
          answerTotal: state.players.length,
          reveal: null,
        }),
      };
    }
    case 'players': {
      const players = action.payload.players;
      const wasOffline = new Set(state.players.filter((p) => p.offline).map((p) => p.id));
      const back = players
        .filter((p) => !p.offline && wasOffline.has(p.id))
        .map(({ id, nickname, avatar }) => ({ id, nickname, avatar, at: action.now }));
      const recent = state.comebacks.filter(
        (c) => action.now - c.at < COMEBACK_MS && !back.some((b) => b.id === c.id),
      );
      return { ...state, players, comebacks: [...recent, ...back] };
    }
    case 'resuming':
      return state.paused ? { ...state, resumeAt: action.now + action.inMs } : state;
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
    case 'survival':
      return { ...state, survival: action.payload };
    case 'drawStrokes': {
      const { index, clear, strokes } = action.payload;
      // Another question's drawing, or a full re-send (rejoin / « Effacer »): start over.
      const base = clear || index !== state.drawing.index ? [] : state.drawing.strokes;
      return { ...state, drawing: { index, strokes: mergeStrokes(base, strokes) } };
    }
  }
}

/** « Dessine-moi »: the drawing of the current question so far. */
export function currentDrawing(state: HostGameState): DrawStroke[] {
  return state.drawing.index === state.questionIndex ? state.drawing.strokes : [];
}

/** How long « <pseudo> est de retour ! » stays on the host screen. */
export const COMEBACK_MS = 4000;

/** Players offline right now (shown on the host screen outside of a pause too). */
export function offlinePlayers(state: Pick<HostGameState, 'players'>): LobbyMember[] {
  return state.players.filter((p) => p.offline);
}

/** Time left in the current timed phase: frozen while paused / while someone has the hand. */
export function remainingMsAt(state: HostGameState, now: number): number | null {
  if (state.paused || state.buzzer?.holder) return state.frozenMs;
  return state.deadline != null ? Math.max(0, state.deadline - now) : null;
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

/** Last question played, or « Survie » over (one survivor left): the podium is next. */
export function isLastQuestion(state: HostGameState): boolean {
  return state.questionIndex >= state.totalQuestions - 1 || !!state.survival?.finished;
}
