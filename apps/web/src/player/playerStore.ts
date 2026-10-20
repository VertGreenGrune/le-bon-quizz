import { useSyncExternalStore } from 'react';
import type { ErrorCode } from '@lbq/shared';
import { getSocket } from '../lib/socket';
import {
  initialPlayerState,
  playerReducer,
  type PlayerAction,
  type PlayerState,
} from './playerState';
import { clearSession, loadSession, saveSession, type PlayerSession } from './session';

/**
 * Module-level store bound to the shared socket. Listeners are attached once, before the
 * first `player:join`, so no server event is missed between the join ack and /play mounting.
 */
const ACK_TIMEOUT_MS = 8000;

let state: PlayerState = initialPlayerState;
const listeners = new Set<() => void>();
let attached = false;
/** Socket id that did the join / last successful rejoin: no rejoin needed while it lives. */
let boundSocketId: string | undefined;
let rejoining = false;

function dispatch(action: PlayerAction) {
  const next = playerReducer(state, action);
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported (iOS Safari)
  }
}

function attach() {
  if (attached) return;
  attached = true;
  const socket = getSocket();

  socket.on('connect', () => {
    dispatch({ type: 'connection', connected: true });
    rejoinIfNeeded();
  });
  socket.on('disconnect', () => dispatch({ type: 'connection', connected: false }));
  socket.on('game:state', (payload) => dispatch({ type: 'state', payload, now: Date.now() }));
  socket.on('question:prompt', (payload) => {
    dispatch({ type: 'prompt', payload, now: Date.now() });
  });
  socket.on('player:result', (payload) => {
    dispatch({ type: 'result', payload });
    vibrate(payload.correct ? [80, 60, 80] : 300);
  });
  socket.on('podium', ({ top }) => dispatch({ type: 'podium', top }));
  socket.on('player:kicked', () => {
    clearSession();
    boundSocketId = undefined;
    dispatch({ type: 'kicked' });
  });

  dispatch({ type: 'connection', connected: socket.connected });
}

function loseSession(code: ErrorCode) {
  clearSession();
  boundSocketId = undefined;
  dispatch({ type: 'lost', code });
}

function rejoinIfNeeded() {
  const socket = getSocket();
  const session = loadSession();
  if (!session || !socket.connected || rejoining) return;
  if (boundSocketId === socket.id) return;
  rejoining = true;
  socket
    .timeout(ACK_TIMEOUT_MS)
    .emit('player:rejoin', { pin: session.pin, sessionToken: session.sessionToken }, (err, res) => {
      rejoining = false;
      if (err) return; // timed out: retried on next connect / mount
      if (!res.ok) {
        loseSession(res.error.code);
        return;
      }
      boundSocketId = socket.id;
      dispatch({ type: 'session', nickname: res.nickname, totalScore: res.totalScore });
    });
}

export type JoinResult = { ok: true } | { ok: false; code: ErrorCode | 'TIMEOUT' };

export function joinGame(pin: string, nickname: string): Promise<JoinResult> {
  attach();
  const socket = getSocket();
  // Fresh state before emitting, so game:state pushed right after the join lands in it.
  clearSession();
  boundSocketId = undefined;
  state = { ...initialPlayerState, connected: socket.connected };
  listeners.forEach((l) => l());
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit('player:join', { pin, nickname }, (err, res) => {
      if (err) return resolve({ ok: false, code: 'TIMEOUT' });
      if (!res.ok) return resolve({ ok: false, code: res.error.code });
      const session: PlayerSession = {
        pin,
        nickname,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
      };
      saveSession(session);
      boundSocketId = socket.id;
      dispatch({ type: 'session', nickname, totalScore: 0 });
      resolve({ ok: true });
    });
  });
}

/** Called by /play on mount: resumes the stored session (reload, phone lock, new tab…). */
export function resumeSession(): PlayerSession | null {
  attach();
  const session = loadSession();
  if (!session) return null;
  if (!state.nickname) dispatch({ type: 'session', nickname: session.nickname, totalScore: 0 });
  rejoinIfNeeded();
  return session;
}

export function sendAnswer(choiceIndex: number) {
  const session = loadSession();
  const { questionIndex, myAnswer } = state;
  if (!session || myAnswer?.questionIndex === questionIndex) return;
  vibrate(40);
  dispatch({ type: 'answer', questionIndex, choiceIndex }); // optimistic
  getSocket()
    .timeout(ACK_TIMEOUT_MS)
    .emit('player:answer', { pin: session.pin, questionIndex, choiceIndex }, (err, res) => {
      // Server already has an answer: keep ours displayed. Otherwise let the player retry.
      if (err || (!res.ok && res.error.code !== 'ALREADY_ANSWERED')) {
        dispatch({ type: 'answerRejected', questionIndex });
      }
    });
}

/** Forget the game (end screen, kicked, "join another game"). */
export function leaveGame() {
  clearSession();
  boundSocketId = undefined;
  state = { ...initialPlayerState, connected: state.connected };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, () => state);
}
