import type { Ack, ChainQuiz, HostActionPayload } from '@lbq/shared';
import { getSocket } from './socket';
import type { GameOptions } from './gameOptions';

const ACK_TIMEOUT_MS = 8000;

/**
 * « 🔁 Enchaîner un quiz » (T48), for the TV (`hostToken`) and the remote (`remoteToken`): the
 * quizzes the room's host can chain, and the chain itself (same PIN, TV, remote and players).
 */
export function chainActions(auth: () => HostActionPayload | null) {
  return {
    listQuizzes: (): Promise<ChainQuiz[] | string> =>
      new Promise((resolve) => {
        const a = auth();
        if (!a) return resolve('Partie introuvable');
        getSocket()
          .timeout(ACK_TIMEOUT_MS)
          .emit('host:quizzes', a, (err, res) => {
            if (err) resolve('Le serveur ne répond pas');
            else resolve(res.ok ? res.quizzes : res.error.message);
          });
      }),
    /** Resolves with an error message, or null once the new lobby is on. */
    chain: (quizId: string, options: GameOptions): Promise<string | null> =>
      new Promise((resolve) => {
        const a = auth();
        if (!a) return resolve('Partie introuvable');
        getSocket()
          .timeout(ACK_TIMEOUT_MS)
          .emit('host:chain', { ...a, quizId, ...options }, (err, res: Ack) => {
            if (err) resolve('Le serveur ne répond pas');
            else resolve(res.ok ? null : res.error.message);
          });
      }),
  };
}

export type ChainActions = ReturnType<typeof chainActions>;
