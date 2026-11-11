import { describe, expect, it } from 'vitest';
import type { QuestionShowPayload } from '@lbq/shared';
import { missingFoundLine, missingRevealPicture, missingStagePicture } from './missing';

const base: QuestionShowPayload = {
  index: 0,
  type: 'MISSING',
  text: 'Qu’est-ce qui a disparu ?',
  imageUrl: 'avant.png',
  choices: [],
  timeLimitSec: 20,
};

describe('« Qu’est-ce qui a disparu ? » helpers', () => {
  it('the TV shows « avant » while memorizing, « après » while answering', () => {
    expect(missingStagePicture({ ...base, missing: { stage: 'memo' } })).toBe('avant.png');
    expect(
      missingStagePicture({ ...base, missing: { stage: 'answer', missingImageUrl: 'apres.png' } }),
    ).toBe('apres.png');
  });

  it('reveal: the picked side and how many found it', () => {
    const reveal = {
      imageUrl: 'avant.png',
      missingImageUrl: 'apres.png',
      zone: { x: 0.5, y: 0.5, radius: 0.1 },
      pins: [
        { x: 0.5, y: 0.5, nickname: 'Alice', avatar: 'batman' as const, correct: true },
        { x: 0.9, y: 0.1, nickname: 'Bob', avatar: 'robin' as const, correct: false },
      ],
    };
    expect(missingRevealPicture(reveal, 'avant')).toBe('avant.png');
    expect(missingRevealPicture(reveal, 'apres')).toBe('apres.png');
    expect(missingFoundLine(reveal)).toBe('1 / 2 dans la zone');
    expect(missingFoundLine({ ...reveal, pins: [] })).toBe('Personne n’a répondu');
  });
});
