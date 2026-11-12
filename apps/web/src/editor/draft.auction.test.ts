import { describe, expect, it } from 'vitest';
import {
  isAuctionDraft,
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
} from './draft';
import type { QuizDraft } from './draft';

const quiz = (q: ReturnType<typeof newQuestion>): QuizDraft => ({
  title: 'Enchères',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});
const mcq = () => ({
  ...newQuestion(),
  text: 'Qui ?',
  choices: [
    { text: 'A', isCorrect: true },
    { text: 'B', isCorrect: false },
  ],
});

describe('« Enchères » in the editor (T64)', () => {
  it('saves the option and its trimmed topic, and round-trips', () => {
    const res = validateDraft(quiz({ ...mcq(), auction: true, auctionTopic: ' Cinéma ' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.questions[0]).toMatchObject({ auction: true, auctionTopic: 'Cinéma' });
    const back = toDraftQuestion(res.data.questions[0]!);
    expect(back).toMatchObject({ auction: true, auctionTopic: 'Cinéma' });
  });

  it('is dropped au buzzer and on the types without bids (kept in the draft)', () => {
    expect(isAuctionDraft({ ...mcq(), auction: true, buzzer: true })).toBe(false);
    const poll = { ...setQuestionType(mcq(), 'POLL'), auction: true };
    expect(isAuctionDraft(poll)).toBe(false);
    const res = validateDraft(quiz({ ...mcq(), auction: true, buzzer: true }));
    expect(res.ok && res.data.questions[0]).not.toHaveProperty('auction');
    const empty = validateDraft(quiz({ ...mcq(), auction: true, auctionTopic: '  ' }));
    expect(empty.ok && empty.data.questions[0]).not.toHaveProperty('auctionTopic');
  });
});
