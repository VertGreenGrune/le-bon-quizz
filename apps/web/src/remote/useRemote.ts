import { useCallback, useEffect, useReducer, useState } from 'react';
import type { Ack, ErrorPayload, ServerToClientEvents, TeamId, TvAction } from '@lbq/shared';
import { getSocket } from '../lib/socket';
import type { AcceptInput } from '../host/accept';
import { listenHostEvents } from '../host/useHostGame';
import {
  forgetRemoteToken,
  initialRemoteState,
  remoteReducer,
  saveRemoteToken,
  type MainEvent,
} from './remoteState';

/**
 * The « Télécommande » of game `pin`: pairs this phone (`remote:join`, again on every
 * reconnection), folds the host events, and sends host actions with the remote token.
 */
export function useRemote(pin: string, remoteToken: string | null) {
  const [state, dispatch] = useReducer(remoteReducer, initialRemoteState);
  const [error, setError] = useState<ErrorPayload | null>(null);
  /** `remote:join` refused: unknown game, or a token that was revoked / never valid. */
  const [lost, setLost] = useState<ErrorPayload | null>(null);
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onAnswer: ServerToClientEvents['remote:answer'] = (payload) =>
      dispatch({ type: 'answer', payload });
    const onRevoked = () => {
      forgetRemoteToken(pin);
      dispatch({ type: 'revoked' });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('remote:answer', onAnswer);
    socket.on('remote:revoked', onRevoked);
    const unlisten = listenHostEvents(socket, dispatch, setError);
    // Back from a locked screen / another app: reconnect right away.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('remote:answer', onAnswer);
      socket.off('remote:revoked', onRevoked);
      unlisten();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pin]);

  useEffect(() => {
    if (!remoteToken) return;
    const socket = getSocket();
    const join = () =>
      socket.emit('remote:join', { pin, remoteToken }, (res) => {
        if (res.ok) {
          setLost(null);
          saveRemoteToken(pin, remoteToken);
        } else if (res.error.code === 'GAME_NOT_FOUND' || res.error.code === 'UNAUTHORIZED') {
          forgetRemoteToken(pin);
          setLost(res.error);
        } else setError(res.error);
      });
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
    };
  }, [pin, remoteToken]);

  const handleAck = useCallback((res: Ack) => setError(res.ok ? null : res.error), []);
  const auth = () => (remoteToken ? { pin, remoteToken } : null);

  const send = (event: MainEvent | 'host:pause' | 'host:resume' | 'host:shuffle') => {
    const a = auth();
    if (a) getSocket().emit(event, a, handleAck);
  };

  return {
    state,
    error,
    lost,
    connected,
    send,
    kick: (playerId: string) => {
      const a = auth();
      if (a) getSocket().emit('host:kick', { ...a, playerId }, handleAck);
    },
    movePlayer: (playerId: string, teamId: TeamId) => {
      const a = auth();
      if (a) getSocket().emit('host:moveplayer', { ...a, playerId, teamId }, handleAck);
    },
    judge: (correct: boolean) => {
      const a = auth();
      if (a) getSocket().emit('host:judge', { ...a, correct }, handleAck);
    },
    /** « ✅ Accepter » a refused answer at the reveal (T44). */
    accept: (questionIndex: number, input: AcceptInput) => {
      const a = auth();
      if (a) getSocket().emit('host:accept', { ...a, questionIndex, ...input }, handleAck);
    },
    tv: (action: TvAction) => {
      const a = auth();
      if (a) getSocket().emit('remote:tv', { ...a, action }, handleAck);
    },
    clearError: () => setError(null),
  };
}
