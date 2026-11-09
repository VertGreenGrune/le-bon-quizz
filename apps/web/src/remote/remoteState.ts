import type { RemoteAnswerPayload } from '@lbq/shared';
import {
  hostReducer,
  initialHostState,
  isLastQuestion,
  teamLobbyStatus,
  type HostAction,
  type HostGameState,
} from '../host/hostReducer';

/**
 * « Télécommande » (T39): the remote gets the same events as the TV (folded by `hostReducer`),
 * plus the answer of the current question and the revocation.
 */
export interface RemoteState {
  host: HostGameState;
  /** `remote:answer` of the last question it was sent for. */
  answer: RemoteAnswerPayload | null;
  /** « Déconnecter la télécommande » on the TV (or a token that is no longer valid). */
  revoked: boolean;
}

export type RemoteAction =
  HostAction | { type: 'answer'; payload: RemoteAnswerPayload } | { type: 'revoked' };

export const initialRemoteState: RemoteState = {
  host: initialHostState,
  answer: null,
  revoked: false,
};

export function remoteReducer(state: RemoteState, action: RemoteAction): RemoteState {
  switch (action.type) {
    case 'answer':
      return { ...state, answer: action.payload };
    case 'revoked':
      return { ...state, revoked: true };
    default: {
      const host = hostReducer(state.host, action);
      // Another quiz chained (T48): the previous quiz's answer must not show on the new one.
      const answer = host.round !== state.host.round ? null : state.answer;
      return { ...state, host, answer };
    }
  }
}

/** The answer of the question on screen (null before it arrives, or outside a question). */
export function currentAnswer(state: RemoteState): RemoteAnswerPayload | null {
  return state.answer?.index === state.host.questionIndex ? state.answer : null;
}

export type MainEvent = 'host:start' | 'host:next' | 'host:end';

/** The big button of the remote: what the host most likely wants to do now. */
export interface MainAction {
  label: string;
  event: MainEvent;
  disabled?: boolean;
}

export function mainAction(state: HostGameState): MainAction | null {
  switch (state.phase) {
    case null:
    case 'LOBBY':
      return {
        label: '▶ Commencer',
        event: 'host:start',
        disabled:
          state.mode === 'teams' ? !teamLobbyStatus(state).ready : state.players.length === 0,
      };
    case 'QUESTION_INTRO':
    case 'ANSWERING':
      return { label: '⏭ Passer', event: 'host:next' };
    case 'REVEAL':
      return { label: 'Suivant', event: 'host:next' };
    case 'LEADERBOARD':
      return isLastQuestion(state)
        ? { label: 'Voir le podium', event: 'host:next' }
        : { label: 'Suivant', event: 'host:next' };
    case 'PODIUM':
      return { label: 'Terminer', event: 'host:end' };
    case 'ENDED':
      return null;
  }
}

/** French name of the phase, in the remote's header. */
export function phaseLabel(state: HostGameState): string {
  const n = `${state.questionIndex + 1} / ${state.totalQuestions}`;
  switch (state.phase) {
    case null:
    case 'LOBBY':
      return "Salle d'attente";
    case 'QUESTION_INTRO':
      return `Question ${n} · Prêts ?`;
    case 'ANSWERING':
      return `Question ${n}`;
    case 'REVEAL':
      return `Question ${n} · Réponse`;
    case 'LEADERBOARD':
      return 'Classement';
    case 'PODIUM':
      return 'Podium';
    case 'ENDED':
      return 'Partie terminée';
  }
}

// ---------- Token (kept per PIN so a reload / a locked phone reconnects) ----------

const tokenKey = (pin: string) => `lbq:remote:${pin}`;

/** The token in the link's fragment (`/remote/<PIN>#<token>`), or null. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function saveRemoteToken(pin: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(pin), token);
  } catch {
    // Private mode: works until the page is reloaded.
  }
}

export function loadRemoteToken(pin: string): string | null {
  try {
    return localStorage.getItem(tokenKey(pin));
  } catch {
    return null;
  }
}

export function forgetRemoteToken(pin: string): void {
  try {
    localStorage.removeItem(tokenKey(pin));
  } catch {
    // Nothing to forget.
  }
}
