import {
  answerCancellable,
  mergeStrokes,
  type AnswerInput,
  type AvatarId,
  type BuzzerStatus,
  type DrawStatus,
  type DrawStroke,
  type DrawStrokesPayload,
  type ErrorCode,
  type GameMode,
  type QuizTheme,
  type GamePause,
  type GamePhase,
  type GameStatePayload,
  type JokerUsedPayload,
  type LobbyTeamsPayload,
  type PlayerJokersPayload,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type RankedPlayer,
  type RankedTeam,
  type SurvivalPlayer,
  type SurvivalStatePayload,
} from '@lbq/shared';

/** Everything the phone knows about the game. Pure data, driven by server events. */
export interface PlayerState {
  connected: boolean;
  /** null until the first `game:state` arrives (after join / rejoin). */
  phase: GamePhase | null;
  mode: GameMode;
  /** TV theme (T40, `game:state.theme`): the waiting screens follow it. */
  theme: QuizTheme;
  /** Title of the quiz (T47, `game:state.quizTitle`), '' until known. */
  quizTitle: string;
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
  /** « Buzzer » question: who has the hand (timer frozen meanwhile), who answered wrong. */
  buzzer: BuzzerStatus | null;
  /** « Dessine-moi » question: who draws, who already found the word (`game:state.draw`). */
  draw: DrawStatus | null;
  /**
   * « Dessine-moi », the drawer: the drawing the server has (sent back on rejoin), with a
   * counter that changes on every full re-send so the canvas redraws it.
   */
  drawing: { index: number; strokes: DrawStroke[]; version: number } | null;
  /**
   * « Select all » question (`prompt.multiple`): the shapes ticked so far (sorted), for
   * `questionIndex` only; sent with « Valider ».
   */
  selection: { questionIndex: number; indexes: number[] } | null;
  /** What the player answered (choice, text or slider value), for `questionIndex` only. */
  myAnswer: ({ questionIndex: number } & AnswerInput) | null;
  /** « Annuler ma réponse » (T43): cancels left on `questionIndex` (absent: none used yet). */
  cancels: { questionIndex: number; left: number } | null;
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
  /** « Mytho ! »: the lie sent while writing (for `questionIndex` only). */
  lie: { questionIndex: number; text: string } | null;
  /** Own jokers: hand + effects on the current question (`joker:state`). */
  jokers: PlayerJokersPayload | null;
  /** Last joker played by anyone (toast), with the local time it arrived. */
  jokerNews: (JokerUsedPayload & { at: number }) | null;
  /** « Survie »: everyone's hearts (`survival:state`). */
  survival: SurvivalStatePayload | null;
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
  | { type: 'toggleChoice'; questionIndex: number; choiceIndex: number }
  | { type: 'answer'; questionIndex: number; answer: AnswerInput }
  | { type: 'answerRejected'; questionIndex: number }
  | { type: 'answerCancelled'; questionIndex: number; cancelsLeft: number }
  | { type: 'result'; payload: PlayerResultPayload }
  | { type: 'podium'; top: RankedPlayer[]; teams?: RankedTeam[] }
  | { type: 'kicked' }
  | { type: 'lost'; code: ErrorCode }
  | { type: 'lie'; questionIndex: number; text: string | null }
  | { type: 'jokers'; payload: PlayerJokersPayload }
  | { type: 'jokerUsed'; payload: JokerUsedPayload; now: number }
  | { type: 'survival'; payload: SurvivalStatePayload }
  | { type: 'drawStrokes'; payload: DrawStrokesPayload };

export const initialPlayerState: PlayerState = {
  connected: false,
  phase: null,
  mode: 'solo',
  theme: 'classic',
  quizTitle: '',
  questionIndex: -1,
  totalQuestions: 0,
  prompt: null,
  answeringEndsAt: null,
  paused: null,
  frozenMs: null,
  resumeAt: null,
  buzzer: null,
  draw: null,
  drawing: null,
  selection: null,
  myAnswer: null,
  cancels: null,
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
  lie: null,
  jokers: null,
  jokerNews: null,
  survival: null,
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
      const buzzer = action.payload.buzzer ?? null;
      // Paused, or a player answering out loud (« Buzzer »): the timer doesn't move.
      const frozen = !!paused || !!buzzer?.holder;
      const sameQuestion = questionIndex === state.questionIndex;
      let answeringEndsAt = sameQuestion ? state.answeringEndsAt : null;
      if (phase === 'ANSWERING' && remainingMs !== undefined && !frozen) {
        answeringEndsAt = action.now + remainingMs;
      }
      // Someone (still / again) missing: no countdown. Everyone back: keep the countdown.
      const waiting = paused && (paused.waitingFor.length > 0 || paused.hostMissing);
      return {
        ...state,
        paused,
        buzzer,
        draw: action.payload.draw ?? null,
        frozenMs: frozen ? (remainingMs ?? null) : null,
        resumeAt: paused && !waiting ? state.resumeAt : null,
        phase,
        mode,
        theme: action.payload.theme ?? 'classic',
        quizTitle: action.payload.quizTitle ?? state.quizTitle,
        jokerGame: !!action.payload.jokers,
        questionIndex,
        totalQuestions,
        answeringEndsAt,
        prompt: state.prompt?.index === questionIndex ? state.prompt : null,
        myAnswer: state.myAnswer?.questionIndex === questionIndex ? state.myAnswer : null,
        selection: state.selection?.questionIndex === questionIndex ? state.selection : null,
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
          isCurrent && (state.answeringEndsAt !== null || state.frozenMs !== null)
            ? state.answeringEndsAt
            : action.now + p.timeLimitSec * 1000,
        myAnswer: state.myAnswer?.questionIndex === p.index ? state.myAnswer : null,
        selection: state.selection?.questionIndex === p.index ? state.selection : null,
        result: isCurrent ? state.result : null,
        // « Mytho ! »: after a rejoin the server tells which lie it already has.
        lie:
          p.bluff?.stage === 'write' && p.bluff.lie
            ? { questionIndex: p.index, text: p.bluff.lie }
            : state.lie?.questionIndex === p.index
              ? state.lie
              : null,
      };
    }

    case 'lie':
      return {
        ...state,
        lie:
          action.text === null ? null : { questionIndex: action.questionIndex, text: action.text },
      };

    case 'toggleChoice': {
      if (state.myAnswer?.questionIndex === action.questionIndex) return state; // already sent
      const current =
        state.selection?.questionIndex === action.questionIndex ? state.selection.indexes : [];
      const indexes = current.includes(action.choiceIndex)
        ? current.filter((i) => i !== action.choiceIndex)
        : [...current, action.choiceIndex].sort((a, b) => a - b);
      return { ...state, selection: { questionIndex: action.questionIndex, indexes } };
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

    case 'answerCancelled':
      // The ticks of a « select all » question stay, to adjust them.
      return {
        ...state,
        myAnswer: state.myAnswer?.questionIndex === action.questionIndex ? null : state.myAnswer,
        cancels: { questionIndex: action.questionIndex, left: action.cancelsLeft },
      };

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

    case 'survival':
      return { ...state, survival: action.payload };

    case 'drawStrokes': {
      const { index, clear, strokes } = action.payload;
      const prev = state.drawing;
      const fresh = clear || prev?.index !== index;
      return {
        ...state,
        drawing: {
          index,
          strokes: mergeStrokes(fresh ? [] : prev!.strokes, strokes),
          version: (prev?.version ?? 0) + (fresh ? 1 : 0),
        },
      };
    }
  }
}

/** « Dessine-moi » question: `drawer` (this phone draws), `guesser`, or null (another type). */
export function drawRole(s: PlayerState): 'drawer' | 'guesser' | null {
  const draw = s.prompt?.index === s.questionIndex ? s.prompt.draw : undefined;
  if (!draw) return null;
  return draw.word !== undefined ? 'drawer' : 'guesser';
}

/** « Dessine-moi »: this player found the word of the current question (also after a reload). */
export function foundTheWord(s: PlayerState): boolean {
  return !!s.draw?.found.some((p) => p.id === s.playerId);
}

/** « Survie »: this player's hearts / haunts (null in the other modes). */
export function mySurvival(s: PlayerState): SurvivalPlayer | null {
  return s.survival?.players.find((p) => p.id === s.playerId) ?? null;
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

/**
 * Phone screens that follow the TV theme (T40): the waiting ones. The answer and result
 * screens keep the classic look (the answer buttons never change).
 */
export function followsTheme(screen: PlayerScreen): boolean {
  return (
    screen === 'connecting' ||
    screen === 'lobby' ||
    screen === 'getReady' ||
    screen === 'answered' ||
    screen === 'waitingResult' ||
    screen === 'standings' ||
    screen === 'podium' ||
    screen === 'ended'
  );
}

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
      if (s.myAnswer?.questionIndex === s.questionIndex || foundTheWord(s)) return 'answered';
      if (bluffStage(s) === 'write' && s.lie?.questionIndex === s.questionIndex) return 'answered';
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
  if (bluffStage(s) === 'write') return null; // « Mytho ! »: the copier still writes its lie
  return j.effects.copied ? null : (j.played.target ?? null);
}

/**
 * « Buzzer » question, while answering: `open` (BUZZ!), `mine` (this phone has the hand),
 * `taken` (someone else has it), `out` (answered wrong). null: not a buzzer question.
 */
export function buzzerView(s: PlayerState): 'open' | 'mine' | 'taken' | 'out' | null {
  if (s.prompt?.index !== s.questionIndex || !s.prompt.buzzer) return null;
  const status = s.buzzer;
  if (status?.wrong.some((p) => p.id === s.playerId)) return 'out';
  if (!status?.holder) return 'open';
  return status.holder.id === s.playerId ? 'mine' : 'taken';
}

/**
 * « Annuler ma réponse » (T43): the answer to the current question can still be cancelled
 * (not on « Buzzer » / « Dessine-moi » / « Mytho ! » questions, not paused, cancels left).
 */
export function canCancelAnswer(s: PlayerState): boolean {
  const p = s.prompt;
  if (s.phase !== 'ANSWERING' || s.paused || !p || p.index !== s.questionIndex) return false;
  if (s.myAnswer?.questionIndex !== s.questionIndex || !answerCancellable(p.type, p.buzzer))
    return false;
  return s.cancels?.questionIndex !== s.questionIndex || s.cancels.left > 0;
}

/** « Select all » question: the shapes ticked on the current question (empty when none). */
export function selectedChoices(s: PlayerState): number[] {
  return s.selection?.questionIndex === s.questionIndex ? s.selection.indexes : [];
}

/** « Mytho ! » stage of the current question (null for the other types). */
export function bluffStage(s: PlayerState): 'write' | 'vote' | null {
  return s.prompt?.index === s.questionIndex ? (s.prompt.bluff?.stage ?? null) : null;
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
  if (paused.byHost) return "⏸ Pause demandée par l'animateur";
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
