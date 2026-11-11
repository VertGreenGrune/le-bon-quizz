import type {
  AnswerInput,
  MissingQuestion,
  QuestionPromptPayload,
  QuestionShowPayload,
  RevealDetails,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';
import { pinPoints } from './pin.js';

/**
 * MISSING — « Qu'est-ce qui a disparu ? » (T59, PLAN.md §3). ANSWERING has two stages, like
 * « Couleurs perdues »:
 * 1. `memo` (`memoSec`): the TV shows the picture « avant »; the phones get nothing of it and
 *    can't answer.
 * 2. `answer` (`timeLimitSec`, new timer): the TV and the phones get the picture « après » (the
 *    phones only that one, never « avant » nor the zone); players tap where the element was and
 *    are scored exactly like PIN, from the start of the stage.
 */
export interface MissingState {
  stage: 'memo' | 'answer';
}

export function newMissing(): MissingState {
  return { stage: 'memo' };
}

/** Stage 2 starts: « après » on every screen. */
export function startMissingAnswer(state: MissingState): void {
  state.stage = 'answer';
}

/** The TV: « avant » (`imageUrl`, already in the payload) while memorizing, then « après ». */
export function missingShow(q: MissingQuestion, state: MissingState): Partial<QuestionShowPayload> {
  return state.stage === 'memo'
    ? { missing: { stage: 'memo' }, timeLimitSec: q.memoSec }
    : { missing: { stage: 'answer', missingImageUrl: q.missingImageUrl } };
}

/** The phones: nothing while memorizing, then the picture « après » only. */
export function missingPrompt(
  q: MissingQuestion,
  state: MissingState,
): Partial<QuestionPromptPayload> {
  return state.stage === 'memo'
    ? { missing: { stage: 'memo' }, timeLimitSec: q.memoSec }
    : { missing: { stage: 'answer' }, imageUrl: q.missingImageUrl };
}

/** Stage 2 answer: a point on « après », scored like PIN. */
export function judgeMissing(
  q: MissingQuestion,
  state: MissingState,
  given: AnswerInput,
  timePoints: number,
): Pick<Answer, 'point' | 'correct' | 'points'> {
  if (state.stage !== 'answer')
    throw new GameError('NOT_ANSWERING', 'Regarde d’abord bien l’image !');
  if (!('point' in given))
    throw new GameError('INVALID_PAYLOAD', 'Cette question attend un point sur l’image');
  return { point: { ...given.point }, ...pinPoints(timePoints, given.point, q.zone) };
}

/** Both pictures, the zone and every player's pin (earliest first). */
export function missingReveal(
  q: MissingQuestion,
  answers: readonly { player: Player; answer: Answer }[],
): RevealDetails {
  return {
    missing: {
      imageUrl: q.imageUrl!,
      missingImageUrl: q.missingImageUrl,
      zone: q.zone,
      pins: answers.flatMap(({ player, answer }) =>
        answer.point
          ? [
              {
                ...answer.point,
                nickname: player.nickname,
                avatar: player.avatar,
                correct: answer.correct,
              },
            ]
          : [],
      ),
    },
  };
}
