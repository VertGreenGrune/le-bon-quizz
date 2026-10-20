import type { ErrorCode, ErrorPayload } from '@lbq/shared';

/** Expected, client-facing failure. Socket handlers turn it into `{ ok: false, error }`. */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }

  toPayload(): ErrorPayload {
    return { code: this.code, message: this.message };
  }
}
