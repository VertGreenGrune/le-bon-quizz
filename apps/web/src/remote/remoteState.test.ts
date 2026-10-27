import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamePhase, GameStatePayload, RemoteAnswerPayload } from '@lbq/shared';
import { initialHostState, type HostGameState } from '../host/hostReducer';
import { remoteToast, remoteUrl } from '../host/remoteUrl';
import { pauseWaitingText } from '../player/playerState';
import {
  currentAnswer,
  forgetRemoteToken,
  initialRemoteState,
  loadRemoteToken,
  mainAction,
  phaseLabel,
  remoteReducer,
  saveRemoteToken,
  tokenFromHash,
} from './remoteState';

const statePayload = (p: Partial<GameStatePayload>): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 0,
  totalQuestions: 3,
  ...p,
});

const host = (p: Partial<HostGameState>): HostGameState => ({ ...initialHostState, ...p });
const alice = { id: 'a', nickname: 'Alice', avatar: 'batman' as const };

describe('remote reducer', () => {
  it('folds host events and keeps the answer of the current question only', () => {
    let s = remoteReducer(initialRemoteState, {
      type: 'state',
      payload: statePayload({ questionIndex: 0, phase: 'QUESTION_INTRO' }),
      now: 0,
    });
    expect(s.host.phase).toBe('QUESTION_INTRO');
    const answer: RemoteAnswerPayload = { index: 0, answer: ['Tim Burton'], explanation: 'Oui.' };
    s = remoteReducer(s, { type: 'answer', payload: answer });
    expect(currentAnswer(s)).toEqual(answer);
    s = remoteReducer(s, {
      type: 'state',
      payload: statePayload({ questionIndex: 1, phase: 'QUESTION_INTRO' }),
      now: 1,
    });
    expect(currentAnswer(s)).toBeNull(); // the next question's answer isn't there yet
    expect(remoteReducer(s, { type: 'revoked' }).revoked).toBe(true);
  });
});

describe('main button of the remote', () => {
  const at = (phase: GamePhase | null, extra: Partial<HostGameState> = {}) =>
    mainAction(host({ phase, questionIndex: 0, totalQuestions: 3, ...extra }));

  it('does the right thing for each phase', () => {
    expect(at('LOBBY')).toEqual({ label: '▶ Commencer', event: 'host:start', disabled: true });
    expect(at('LOBBY', { players: [alice] })).toMatchObject({ disabled: false });
    expect(at('QUESTION_INTRO')).toEqual({ label: '⏭ Passer', event: 'host:next' });
    expect(at('ANSWERING')).toEqual({ label: '⏭ Passer', event: 'host:next' });
    expect(at('REVEAL')).toEqual({ label: 'Suivant', event: 'host:next' });
    expect(at('LEADERBOARD')).toEqual({ label: 'Suivant', event: 'host:next' });
    expect(at('LEADERBOARD', { questionIndex: 2 })).toEqual({
      label: 'Voir le podium',
      event: 'host:next',
    });
    expect(at('PODIUM')).toEqual({ label: 'Terminer', event: 'host:end' });
    expect(at('ENDED')).toBeNull();
  });

  it('team lobby: only once the teams are ready', () => {
    const teams = [
      { id: 0 as const, name: 'Équipe Rouge', members: [alice] },
      { id: 1 as const, name: 'Équipe Bleue', members: [] },
    ];
    expect(at('LOBBY', { mode: 'teams', players: [{ ...alice, teamId: 0 }], teams })).toMatchObject(
      {
        disabled: true,
      },
    );
  });

  it('phase labels', () => {
    expect(phaseLabel(host({ phase: 'ANSWERING', questionIndex: 1, totalQuestions: 5 }))).toBe(
      'Question 2 / 5',
    );
    expect(phaseLabel(host({ phase: 'LOBBY' }))).toBe("Salle d'attente");
  });
});

describe('remote token', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('comes from the link fragment', () => {
    expect(tokenFromHash('#abc-DEF_1')).toBe('abc-DEF_1');
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#')).toBeNull();
  });

  it('is kept per PIN so a reload reconnects', () => {
    saveRemoteToken('123456', 'tok');
    expect(loadRemoteToken('123456')).toBe('tok');
    expect(loadRemoteToken('654321')).toBeNull();
    forgetRemoteToken('123456');
    expect(loadRemoteToken('123456')).toBeNull();
  });
});

describe('TV side', () => {
  it('puts the token in the fragment of the link', () => {
    expect(remoteUrl('http://192.168.1.20:5173', '123456', 'tok')).toBe(
      'http://192.168.1.20:5173/remote/123456#tok',
    );
  });

  it('toasts when a remote connects or disconnects (not on the first status)', () => {
    expect(remoteToast(null, 1)).toBeNull();
    expect(remoteToast(0, 1)).toBe('📱 Télécommande connectée');
    expect(remoteToast(1, 0)).toBe('📱 Télécommande déconnectée');
    expect(remoteToast(1, 1)).toBeNull();
  });

  it('phones say the host paused', () => {
    expect(pauseWaitingText({ waitingFor: [], hostMissing: false, sinceMs: 0, byHost: true })).toBe(
      "⏸ Pause demandée par l'animateur",
    );
  });
});
