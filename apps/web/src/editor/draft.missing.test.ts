import { describe, expect, it } from 'vitest';
import {
  hasMedia,
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
  type DraftQuestion,
  type QuizDraft,
} from './draft';

const quiz = (q: DraftQuestion): QuizDraft => ({
  title: 'Disparu',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

const AVANT = 'https://example.com/uploads/avant.png';
const APRES = 'https://example.com/uploads/apres.png';

const missing = (): DraftQuestion => ({
  ...setQuestionType({ ...newQuestion(), text: 'Qu’est-ce qui a disparu ?' }, 'MISSING'),
  imageUrl: AVANT,
  missingImageUrl: APRES,
  imageEffect: 'blur',
  zone: { x: 0.3, y: 0.6, radius: 0.08 },
  memoSec: 15,
});

describe('« Qu’est-ce qui a disparu ? » in the editor', () => {
  it('sends both pictures, the zone and the memo time (no image effect); round trip', () => {
    const res = validateDraft(quiz(missing()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sent = res.data.questions[0]!;
    expect(sent).toMatchObject({
      type: 'MISSING',
      imageUrl: AVANT,
      missingImageUrl: APRES,
      zone: { x: 0.3, y: 0.6, radius: 0.08 },
      memoSec: 15,
    });
    expect(sent.imageEffect).toBeUndefined();
    expect(toDraftQuestion(sent)).toMatchObject({
      type: 'MISSING',
      imageUrl: AVANT,
      missingImageUrl: APRES,
      zone: { x: 0.3, y: 0.6, radius: 0.08 },
      memoSec: 15,
    });
  });

  it('both pictures are required', () => {
    const noAfter = validateDraft(quiz({ ...missing(), missingImageUrl: undefined }));
    expect(noAfter.ok).toBe(false);
    if (!noAfter.ok) expect(noAfter.errors['questions.0.missingImageUrl']).toBeDefined();
    const noBefore = validateDraft(quiz({ ...missing(), imageUrl: undefined }));
    expect(noBefore.ok).toBe(false);
    if (!noBefore.ok) expect(noBefore.errors['questions.0.imageUrl']).toBeDefined();
  });

  it('the picture « après » counts as shared media', () => {
    expect(hasMedia(quiz({ ...missing(), imageUrl: undefined }))).toBe(true);
  });
});
