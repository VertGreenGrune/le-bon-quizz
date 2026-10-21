import { useCallback, useEffect, useReducer, useState } from 'react';
import type {
  Ack,
  ErrorPayload,
  HostActionPayload,
  ServerToClientEvents,
  TeamId,
} from '@lbq/shared';
import { SOLO, type GameOptions } from '../lib/gameOptions';
import { getSocket } from '../lib/socket';
import { hostReducer, initialHostState } from './hostReducer';

const tokenKey = (pin: string) => `lbq:host:${pin}`;

export function saveHostToken(pin: string, hostToken: string) {
  try {
    sessionStorage.setItem(tokenKey(pin), hostToken);
  } catch {
    // Private mode etc.: the game still works until the tab is reloaded.
  }
}

export function loadHostToken(pin: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(pin));
  } catch {
    return null;
  }
}

const CREATE_TIMEOUT_MS = 8000;

let pendingCreate: Promise<{ pin: string; hostToken: string }> | null = null;

/**
 * Creates a game with `quizId` (the demo quiz by default). Memoized so React StrictMode's
 * double effect doesn't create two games. Rejects if the server doesn't answer (e.g. not running).
 */
export function createGame(
  quizId = 'demo',
  options: GameOptions = SOLO,
): Promise<{ pin: string; hostToken: string }> {
  const payload = options.mode === 'teams' ? { quizId, ...options } : { quizId };
  pendingCreate ??= new Promise((resolve, reject) => {
    getSocket()
      .timeout(CREATE_TIMEOUT_MS)
      .emit('host:create', payload, (err, res) => {
        pendingCreate = null;
        if (err) {
          reject({
            code: 'GAME_NOT_FOUND',
            message: `Le serveur de jeu ne répond pas (${location.hostname}:3001). Vérifie qu'il est lancé avec « pnpm dev ».`,
          } satisfies ErrorPayload);
        } else if (res.ok) {
          saveHostToken(res.pin, res.hostToken);
          resolve({ pin: res.pin, hostToken: res.hostToken });
        } else reject(res.error);
      });
  });
  return pendingCreate;
}

/**
 * Subscribes to every host-facing server event and exposes host actions.
 * Listeners live as long as the component (not the pin), so events sent right after
 * `host:create` are not lost while the URL switches from /host/new to /host/:pin.
 */
export function useHostGame(pin: string | undefined, hostToken: string | null) {
  const [state, dispatch] = useReducer(hostReducer, initialHostState);
  const [error, setError] = useState<ErrorPayload | null>(null);
  /** Set when `host:rejoin` says the game is gone (server restarted, game swept, bad token). */
  const [lost, setLost] = useState<ErrorPayload | null>(null);
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState: ServerToClientEvents['game:state'] = (p) =>
      dispatch({ type: 'state', payload: p, now: Date.now() });
    const onPlayers: ServerToClientEvents['lobby:players'] = (p) =>
      dispatch({ type: 'players', payload: p });
    const onTeams: ServerToClientEvents['lobby:teams'] = (p) =>
      dispatch({ type: 'teams', payload: p });
    const onQuestion: ServerToClientEvents['question:show'] = (p) =>
      dispatch({ type: 'question', payload: p });
    const onCount: ServerToClientEvents['answer:count'] = (p) => dispatch({ type: 'count', ...p });
    const onReveal: ServerToClientEvents['question:reveal'] = (p) =>
      dispatch({ type: 'reveal', payload: p });
    const onLeaderboard: ServerToClientEvents['leaderboard'] = (p) =>
      dispatch({ type: 'leaderboard', ...p });
    const onPodium: ServerToClientEvents['podium'] = (p) => dispatch({ type: 'podium', ...p });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:state', onState);
    socket.on('lobby:players', onPlayers);
    socket.on('lobby:teams', onTeams);
    socket.on('question:show', onQuestion);
    socket.on('answer:count', onCount);
    socket.on('question:reveal', onReveal);
    socket.on('leaderboard', onLeaderboard);
    socket.on('podium', onPodium);
    socket.on('error', setError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game:state', onState);
      socket.off('lobby:players', onPlayers);
      socket.off('lobby:teams', onTeams);
      socket.off('question:show', onQuestion);
      socket.off('answer:count', onCount);
      socket.off('question:reveal', onReveal);
      socket.off('leaderboard', onLeaderboard);
      socket.off('podium', onPodium);
      socket.off('error', setError);
    };
  }, []);

  // Page reload or socket reconnect: re-attach as host; the server re-sends the current phase.
  useEffect(() => {
    if (!pin || !hostToken) return;
    const socket = getSocket();
    const rejoin = () =>
      socket.emit('host:rejoin', { pin, hostToken }, (res) => {
        if (res.ok) setLost(null);
        else if (res.error.code === 'GAME_NOT_FOUND' || res.error.code === 'UNAUTHORIZED')
          setLost(res.error);
        else setError(res.error);
      });
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);
    return () => {
      socket.off('connect', rejoin);
    };
  }, [pin, hostToken]);

  const handleAck = useCallback((res: Ack) => {
    if (res.ok) setError(null);
    else setError(res.error);
  }, []);

  const auth = (): HostActionPayload | null => (pin && hostToken ? { pin, hostToken } : null);

  const start = () => {
    const a = auth();
    if (a) getSocket().emit('host:start', a, handleAck);
  };
  const next = () => {
    const a = auth();
    if (a) getSocket().emit('host:next', a, handleAck);
  };
  const end = () => {
    const a = auth();
    if (a) getSocket().emit('host:end', a, handleAck);
  };
  const kick = (playerId: string) => {
    const a = auth();
    if (a) getSocket().emit('host:kick', { ...a, playerId }, handleAck);
  };
  const movePlayer = (playerId: string, teamId: TeamId) => {
    const a = auth();
    if (a) getSocket().emit('host:moveplayer', { ...a, playerId, teamId }, handleAck);
  };
  const shuffle = () => {
    const a = auth();
    if (a) getSocket().emit('host:shuffle', a, handleAck);
  };

  return {
    state,
    error,
    lost,
    connected,
    start,
    next,
    end,
    kick,
    movePlayer,
    shuffle,
    clearError: () => setError(null),
  };
}

/** Re-renders every `intervalMs` while `active`, returning the current time. */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
