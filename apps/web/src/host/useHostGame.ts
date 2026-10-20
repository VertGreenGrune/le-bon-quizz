import { useCallback, useEffect, useReducer, useState } from 'react';
import type { Ack, ErrorPayload, HostActionPayload, ServerToClientEvents } from '@lbq/shared';
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

let pendingCreate: Promise<{ pin: string; hostToken: string }> | null = null;

/**
 * Creates a game with the demo quiz. Memoized so React StrictMode's double effect
 * doesn't create two games.
 */
export function createDemoGame(): Promise<{ pin: string; hostToken: string }> {
  pendingCreate ??= new Promise((resolve, reject) => {
    getSocket().emit('host:create', { quizId: 'demo' }, (res) => {
      pendingCreate = null;
      if (res.ok) {
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
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState: ServerToClientEvents['game:state'] = (p) =>
      dispatch({ type: 'state', payload: p, now: Date.now() });
    const onPlayers: ServerToClientEvents['lobby:players'] = (p) =>
      dispatch({ type: 'players', payload: p });
    const onQuestion: ServerToClientEvents['question:show'] = (p) =>
      dispatch({ type: 'question', payload: p });
    const onCount: ServerToClientEvents['answer:count'] = (p) => dispatch({ type: 'count', ...p });
    const onReveal: ServerToClientEvents['question:reveal'] = (p) =>
      dispatch({ type: 'reveal', payload: p });
    const onLeaderboard: ServerToClientEvents['leaderboard'] = (p) =>
      dispatch({ type: 'leaderboard', top: p.top });
    const onPodium: ServerToClientEvents['podium'] = (p) =>
      dispatch({ type: 'podium', top: p.top });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:state', onState);
    socket.on('lobby:players', onPlayers);
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
      socket.off('question:show', onQuestion);
      socket.off('answer:count', onCount);
      socket.off('question:reveal', onReveal);
      socket.off('leaderboard', onLeaderboard);
      socket.off('podium', onPodium);
      socket.off('error', setError);
    };
  }, []);

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

  return { state, error, connected, start, next, end, kick, clearError: () => setError(null) };
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
