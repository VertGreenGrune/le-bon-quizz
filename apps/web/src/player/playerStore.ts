import { useSyncExternalStore } from 'react';
import type { AnswerInput, AvatarId, ErrorCode, HauntType, JokerType, TeamId } from '@lbq/shared';
import { getSocket } from '../lib/socket';
import {
  errorMessage,
  initialPlayerState,
  playerReducer,
  type PlayerAction,
  type PlayerState,
} from './playerState';
import { saveAvatarChoice } from './avatarChoice';
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
  socket.on('game:state', (payload) => {
    dispatch({ type: 'state', payload, now: Date.now() });
    // Game over: nothing to resume any more (the end screen stays displayed).
    if (payload.phase === 'ENDED') clearSession();
  });
  socket.on('game:resuming', ({ inMs }) => {
    dispatch({ type: 'resuming', inMs, now: Date.now() });
    vibrate(60);
  });
  socket.on('question:prompt', (payload) => {
    dispatch({ type: 'prompt', payload, now: Date.now() });
  });
  socket.on('player:result', (payload) => {
    dispatch({ type: 'result', payload });
    // « Survie »: a long buzz for the last heart lost.
    vibrate(
      payload.survival?.eliminated
        ? [400, 100, 400, 100, 800]
        : payload.correct
          ? [80, 60, 80]
          : 300,
    );
  });
  socket.on('lobby:teams', (payload) => dispatch({ type: 'teams', payload }));
  socket.on('joker:state', (payload) => dispatch({ type: 'jokers', payload }));
  socket.on('joker:used', (payload) => {
    dispatch({ type: 'jokerUsed', payload, now: Date.now() });
    if (payload.target?.id === state.playerId) vibrate([200, 80, 200]); // attacked!
  });
  socket.on('podium', ({ top, teams }) => dispatch({ type: 'podium', top, teams }));
  socket.on('survival:state', (payload) => dispatch({ type: 'survival', payload }));
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

function loseSession(code: ErrorCode, pin: string) {
  clearSession(pin);
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
        loseSession(res.error.code, session.pin);
        return;
      }
      boundSocketId = sid;
      dispatch({
        type: 'session',
        playerId: res.playerId,
        nickname: res.nickname,
        avatar: res.avatar,
        totalScore: res.totalScore,
      });
    });
}

export type JoinResult = { ok: true } | { ok: false; code: ErrorCode | 'TIMEOUT' };

/**
 * Joins the game, or — once it has started — takes the place of the disconnected player with
 * this nickname (session lost: other phone, browser data cleared…).
 */
export function joinGame(pin: string, nickname: string, avatar: AvatarId): Promise<JoinResult> {
  attach();
  const socket = getSocket();
  // Fresh state before emitting, so game:state pushed right after the join lands in it.
  clearSession(pin);
  boundSocketId = undefined;
  state = { ...initialPlayerState, connected: socket.connected };
  listeners.forEach((l) => l());
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit('player:join', { pin, nickname, avatar }, (err, res) => {
      if (err) return resolve({ ok: false, code: 'TIMEOUT' });
      if (!res.ok) return resolve({ ok: false, code: res.error.code });
      const session: PlayerSession = {
        pin,
        nickname: res.nickname ?? nickname,
        avatar: res.avatar,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
      };
      saveSession(session);
      boundSocketId = socket.id;
      dispatch({
        type: 'session',
        playerId: res.playerId,
        nickname: session.nickname,
        avatar: res.avatar,
        totalScore: res.totalScore ?? 0,
      });
      if (!res.reclaimed) saveAvatarChoice(res.avatar);
      resolve({ ok: true });
    });
  });
}

export interface JoinInfo {
  /** Avatars already taken in the game (a hint, shown dimmed). */
  taken: AvatarId[];
  /** The game has started: only a disconnected player's place can be taken back. */
  started: boolean;
}

/**
 * Join screen hints for the game with this PIN (nothing taken, not started if the game is
 * unknown or the server doesn't answer — they are only hints).
 */
export function fetchJoinInfo(pin: string): Promise<JoinInfo> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:avatars', { pin }, (err, res) =>
        resolve(!err && res.ok ? { taken: res.taken, started: !!res.started } : NO_JOIN_INFO),
      );
  });
}

const NO_JOIN_INFO: JoinInfo = { taken: [], started: false };

/** Called by /play on mount: resumes the stored session (reload, phone lock, new tab…). */
export function resumeSession(): PlayerSession | null {
  attach();
  const session = loadSession();
  if (!session) return null;
  if (!state.nickname) {
    const { playerId, nickname, avatar } = session;
    dispatch({ type: 'session', playerId, nickname, avatar, totalScore: 0 });
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

/**
 * « Mytho ! », writing stage: sends (or replaces) the player's lie through `player:answer`;
 * resolves with the French error message (lie too close to the truth…) or null.
 */
export function sendLie(text: string): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  const { questionIndex } = state;
  vibrate(40);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:answer', { pin: session.pin, questionIndex, text }, (err, res) => {
        if (err) return resolve(errorMessage('TIMEOUT'));
        if (!res.ok) return resolve(res.error.message);
        dispatch({ type: 'lie', questionIndex, text });
        resolve(null);
      });
  });
}

/** « Mytho ! »: back to the text field to write another lie (until the vote starts). */
export function editLie() {
  dispatch({ type: 'lie', questionIndex: state.questionIndex, text: null });
}

/**
 * Plays a joker on the current question; resolves with the French error message, or null when
 * the server accepted it (it then sends `joker:state` / `joker:used`).
 */
export function playJoker(joker: JokerType, targetId?: string): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  vibrate(40);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit(
        'player:joker',
        { pin: session.pin, questionIndex: state.questionIndex, joker, targetId },
        (err, res) => {
          if (err) resolve(errorMessage('TIMEOUT'));
          else resolve(res.ok ? null : res.error.message);
        },
      );
  });
}

/**
 * « Survie »: a ghost haunts a living player; resolves with the French error message, or null
 * when the server accepted it (it then sends `joker:used` / `survival:state`).
 */
export function hauntPlayer(haunt: HauntType, targetId: string): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  vibrate(40);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:haunt', { pin: session.pin, haunt, targetId }, (err, res) => {
        if (err) resolve(errorMessage('TIMEOUT'));
        else resolve(res.ok ? null : res.error.message);
      });
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
