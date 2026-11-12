import { useSyncExternalStore } from 'react';
import type {
  AnswerInput,
  AvatarId,
  DrawGuess,
  ListGuessAck,
  DrawStroke,
  ErrorCode,
  HauntType,
  JokerType,
  PotatoAnswerAck,
  TeamId,
} from '@lbq/shared';
import { getSocket } from '../lib/socket';
import {
  errorMessage,
  initialPlayerState,
  playerReducer,
  selectedChoices,
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
/** Session of the game that just ended, kept in case the host chains another quiz (T48). */
let endedSession: PlayerSession | null = null;
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
    // Game over: nothing to resume any more (the end screen stays displayed)…
    if (payload.phase === 'ENDED') {
      endedSession = loadSession() ?? endedSession;
      clearSession();
    } else if (endedSession && payload.round !== undefined) {
      // …unless the host chains another quiz in the same room (T48): the session goes on.
      saveSession(endedSession);
      endedSession = null;
    }
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
  socket.on('draw:strokes', (payload) => dispatch({ type: 'drawStrokes', payload }));
  socket.on('auction:bid', (payload) => dispatch({ type: 'auctionBid', payload }));
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
  endedSession = null;
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
 * « Annuler ma réponse » (T43): removes the answer on the server, back to the answer screen;
 * resolves with the French error message, or null.
 */
export function cancelAnswer(): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  const { questionIndex } = state;
  vibrate(30);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:unanswer', { pin: session.pin, questionIndex }, (err, res) => {
        if (err) return resolve(errorMessage('TIMEOUT'));
        if (!res.ok) return resolve(res.error.message);
        dispatch({ type: 'answerCancelled', questionIndex, cancelsLeft: res.cancelsLeft });
        resolve(null);
      });
  });
}

/** « Select all » question: ticks / unticks a shape (sent later with `validateChoices`). */
export function toggleChoice(choiceIndex: number) {
  vibrate(20);
  dispatch({ type: 'toggleChoice', questionIndex: state.questionIndex, choiceIndex });
}

/** « Select all » question, « Valider »: sends every ticked shape (speed points from now). */
export function validateChoices() {
  const indexes = selectedChoices(state);
  if (indexes.length > 0) sendAnswer({ choiceIndexes: indexes });
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

/**
 * « Dessine-moi », a guesser: sends a guess; resolves with `found` (then shown as the answer),
 * `close` / `wrong` (try again), or the French error message.
 */
export function sendGuess(text: string): Promise<{ guess: DrawGuess } | { error: string }> {
  const session = loadSession();
  if (!session) return Promise.resolve({ error: 'Session introuvable' });
  const { questionIndex } = state;
  vibrate(30);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:answer', { pin: session.pin, questionIndex, text }, (err, res) => {
        if (err) return resolve({ error: errorMessage('TIMEOUT') });
        if (!res.ok) return resolve({ error: res.error.message });
        const guess = res.guess ?? 'wrong';
        if (guess === 'found') {
          vibrate([80, 60, 80]);
          dispatch({ type: 'answer', questionIndex, answer: { text } });
        }
        resolve({ guess });
      });
  });
}

/**
 * « Liste chrono » (T57): sends one guess; resolves with the server's verdict (`found` items are
 * added to the phone's list) or the French error message.
 */
export function sendListGuess(text: string): Promise<ListGuessAck | { error: string }> {
  const session = loadSession();
  if (!session) return Promise.resolve({ error: 'Session introuvable' });
  const { questionIndex } = state;
  vibrate(30);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:answer', { pin: session.pin, questionIndex, text }, (err, res) => {
        if (err) return resolve({ error: errorMessage('TIMEOUT') });
        if (!res.ok) return resolve({ error: res.error.message });
        const list = res.list ?? { result: 'wrong' as const, found: 0 };
        if (list.result === 'found' && list.item) {
          vibrate([60, 40, 60]);
          dispatch({ type: 'listFound', questionIndex, item: list.item });
        }
        resolve(list);
      });
  });
}

/**
 * « Dessine-moi », the drawer: new stroke chunks (`clear` = the drawing was erased first). Sent
 * as they come (the pad throttles them); a refused message (pause) is simply dropped — the
 * server sends its drawing back on rejoin.
 */
export function sendStrokes(strokes: DrawStroke[], clear = false) {
  const session = loadSession();
  if (!session) return;
  getSocket().emit(
    'player:draw',
    {
      pin: session.pin,
      questionIndex: state.questionIndex,
      ...(clear && { clear: true as const }),
      strokes,
    },
    () => {},
  );
}

/** « Mytho ! »: back to the text field to write another lie (until the vote starts). */
/**
 * « Paris sur les réponses », stage 1: sends (or replaces) the guess; resolves with the French
 * error message, or null.
 */
export function sendWagerGuess(value: number): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  const { questionIndex } = state;
  vibrate(40);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:answer', { pin: session.pin, questionIndex, value }, (err, res) => {
        if (err) return resolve(errorMessage('TIMEOUT'));
        if (!res.ok) return resolve(res.error.message);
        dispatch({ type: 'wagerGuess', questionIndex, value });
        resolve(null);
      });
  });
}

/**
 * « Sur la même longueur d'onde », the psychic: sends the clue (final; the guesses start with a
 * new prompt); resolves with the French error message (a word of the scale…) or null.
 */
export function sendWavelengthClue(text: string): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  const { questionIndex } = state;
  vibrate(40);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:answer', { pin: session.pin, questionIndex, text }, (err, res) => {
        if (err) return resolve(errorMessage('TIMEOUT'));
        resolve(res.ok ? null : res.error.message);
      });
  });
}

/**
 * « Patate chaude », the holder: answers the sub-question. Resolves with `pass` / `wrong`, or the
 * French error message (locked after a wrong answer, the bomb already left…).
 */
export function sendPotatoAnswer(
  choiceIndex: number,
): Promise<{ result: PotatoAnswerAck } | { error: string }> {
  const session = loadSession();
  if (!session) return Promise.resolve({ error: 'Session introuvable' });
  const { questionIndex } = state;
  vibrate(30);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:answer', { pin: session.pin, questionIndex, choiceIndex }, (err, res) => {
        if (err) return resolve({ error: errorMessage('TIMEOUT') });
        if (!res.ok) return resolve({ error: res.error.message });
        resolve({ result: res.potato ?? 'pass' });
      });
  });
}

/**
 * « Enchères » (T64), the bid stage: sends the bid (replaces the previous one); resolves with the
 * French error message (bids closed, above the max…) or null.
 */
export function sendBid(amount: number): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  const { questionIndex } = state;
  vibrate(30);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:bid', { pin: session.pin, questionIndex, amount }, (err, res) => {
        if (err) return resolve(errorMessage('TIMEOUT'));
        if (!res.ok) return resolve(res.error.message);
        dispatch({ type: 'bidPlaced', questionIndex, amount: res.amount });
        resolve(null);
      });
  });
}

/** « Changer mon estimation »: back to the number field (the server keeps the old one meanwhile). */
export function editWagerGuess() {
  dispatch({ type: 'wagerGuess', questionIndex: state.questionIndex, value: null });
}

export function editLie() {
  dispatch({ type: 'lie', questionIndex: state.questionIndex, text: null });
}

/**
 * « Buzzer »: hits BUZZ on the current question; resolves with the French error message
 * (someone was faster, Gel…), or null when the player has the hand (`game:state.buzzer`).
 */
export function sendBuzz(): Promise<string | null> {
  const session = loadSession();
  if (!session) return Promise.resolve('Session introuvable');
  vibrate(40);
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:buzz', { pin: session.pin, questionIndex: state.questionIndex }, (err, res) => {
        if (err) return resolve(errorMessage('TIMEOUT'));
        if (!res.ok) return resolve(res.error.message);
        vibrate([150, 80, 150]);
        resolve(null);
      });
  });
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
  endedSession = null;
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
