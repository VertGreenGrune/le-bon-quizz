import { useSyncExternalStore } from 'react';
import type { AnswerInput, ErrorCode, TeamId } from '@lbq/shared';
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
/** Liveness probe when the phone wakes up: short, a frozen socket must be replaced fast. */
const PROBE_TIMEOUT_MS = 3000;

let state: PlayerState = initialPlayerState;
const listeners = new Set<() => void>();
let attached = false;
/** Socket id that did the join / last successful rejoin: no rejoin needed while it lives. */
let boundSocketId: string | undefined;
/** Socket id of the in-flight `player:rejoin`: a reconnect mid-rejoin starts a fresh one. */
let rejoiningSocketId: string | undefined;

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
  socket.on('lobby:teams', (payload) => dispatch({ type: 'teams', payload }));
  socket.on('podium', ({ top, teams }) => dispatch({ type: 'podium', top, teams }));
  socket.on('player:kicked', () => {
    clearSession();
    boundSocketId = undefined;
    dispatch({ type: 'kicked' });
  });

  // Phone unlocked / tab back in front / Wi-Fi back. While the phone sleeps the JS is frozen:
  // the socket may still look connected although the server dropped it long ago, or sit in a
  // long reconnection back-off. Check it now instead of waiting for the next ping timeout.
  const onWake = () => {
    if (document.visibilityState !== 'visible' || !loadSession()) return;
    // Ended games are swept by the server: a rejoin would turn the end screen into "lost".
    if (state.phase === 'ENDED' || state.kicked || state.lost) return;
    if (socket.connected) rejoinIfNeeded({ probe: true });
    else reconnectNow();
  };
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('pageshow', onWake); // restored from the back/forward cache
  window.addEventListener('online', onWake);

  dispatch({ type: 'connection', connected: socket.connected });
}

/** Drops the current (possibly dead) connection and reconnects right away, no back-off. */
function reconnectNow() {
  const socket = getSocket();
  socket.disconnect();
  socket.connect(); // `connect` handler rejoins
}

function loseSession(code: ErrorCode) {
  clearSession();
  boundSocketId = undefined;
  dispatch({ type: 'lost', code });
}

/**
 * `player:rejoin` with the stored session if this socket isn't bound to it yet. With `probe`,
 * rejoins even a bound socket (idempotent on the server, which re-sends the current state):
 * used as a liveness check after the phone wakes up.
 */
function rejoinIfNeeded({ probe = false } = {}) {
  const socket = getSocket();
  const session = loadSession();
  const sid = socket.id;
  if (!session || !socket.connected || !sid || rejoiningSocketId === sid) return;
  if (!probe && boundSocketId === sid) return;
  rejoiningSocketId = sid;
  socket
    .timeout(probe ? PROBE_TIMEOUT_MS : ACK_TIMEOUT_MS)
    .emit('player:rejoin', { pin: session.pin, sessionToken: session.sessionToken }, (err, res) => {
      if (rejoiningSocketId === sid) rejoiningSocketId = undefined;
      // Reconnected meanwhile (that connection rejoins by itself), or joined another game.
      if (socket.id !== sid || loadSession()?.sessionToken !== session.sessionToken) return;
      if (err) {
        // Connected but no answer: half-open socket (Wi-Fi switch, NAT timeout…). Start over.
        reconnectNow();
        return;
      }
      if (!res.ok) {
        loseSession(res.error.code);
        return;
      }
      boundSocketId = sid;
      dispatch({
        type: 'session',
        playerId: res.playerId,
        nickname: res.nickname,
        totalScore: res.totalScore,
      });
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
      dispatch({ type: 'session', playerId: res.playerId, nickname, totalScore: 0 });
      resolve({ ok: true });
    });
  });
}

/** Called by /play on mount: resumes the stored session (reload, phone lock, new tab…). */
export function resumeSession(): PlayerSession | null {
  attach();
  const session = loadSession();
  if (!session) return null;
  if (!state.nickname) {
    const { playerId, nickname } = session;
    dispatch({ type: 'session', playerId, nickname, totalScore: 0 });
  }
  rejoinIfNeeded();
  return session;
}

/** A shape tapped (choice questions), a typed text or a slider value. */
export function sendAnswer(answer: AnswerInput) {
  const session = loadSession();
  const { questionIndex, myAnswer } = state;
  if (!session || myAnswer?.questionIndex === questionIndex) return;
  vibrate(40);
  dispatch({ type: 'answer', questionIndex, answer }); // optimistic
  getSocket()
    .timeout(ACK_TIMEOUT_MS)
    .emit('player:answer', { pin: session.pin, questionIndex, ...answer }, (err, res) => {
      // Server already has an answer: keep ours displayed. Otherwise let the player retry.
      if (err || (!res.ok && res.error.code !== 'ALREADY_ANSWERED')) {
        dispatch({ type: 'answerRejected', questionIndex });
      }
    });
}

/** Team mode, lobby: picks / switches team. The server answers with `lobby:teams`. */
export function chooseTeam(teamId: TeamId) {
  const session = loadSession();
  if (!session) return;
  vibrate(40);
  getSocket().emit('player:team', { pin: session.pin, teamId }, () => {});
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
