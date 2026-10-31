import { describe, expect, it } from 'vitest';
import type { GameQuestionReport, QuestionRevealPayload } from '@lbq/shared';
import { acceptedText } from '../reports/reportStats';
import { acceptOptions, nextSliderMargin } from './accept';

const mcq: QuestionRevealPayload = {
  type: 'MCQ',
  correctIndexes: [0, 2],
  distribution: [3, 1, 2],
  accepted: { choiceIndexes: [2] },
};

describe('« ✅ Accepter » helpers (T44)', () => {
  it('lists every choice with its count and state', () => {
    expect(acceptOptions(mcq, ['A', 'B', 'C'])).toEqual([
      expect.objectContaining({ label: 'A', shape: 0, count: 3, right: true, accepted: false }),
      expect.objectContaining({ label: 'B', count: 1, right: false, input: { choiceIndex: 1 } }),
      expect.objectContaining({ label: 'C', count: 2, right: true, accepted: true }),
    ]);
  });

  it('lists every typed group (not only the top 6), nothing for other types / buzzer', () => {
    const typed: QuestionRevealPayload = {
      type: 'TYPE_ANSWER',
      correctIndexes: [],
      distribution: [],
      topAnswers: [{ text: 'Pacifique', count: 2, correct: true }],
      typedAnswers: [
        { text: 'Pacifique', count: 2, correct: true },
        { text: 'Atlantique', count: 1, correct: true, accepted: true },
        { text: 'Indien', count: 1, correct: false },
      ],
    };
    expect(acceptOptions(typed, []).map((o) => [o.label, o.right, o.accepted, o.input])).toEqual([
      ['Pacifique', true, false, { text: 'Pacifique' }],
      ['Atlantique', true, true, { text: 'Atlantique' }],
      ['Indien', false, false, { text: 'Indien' }],
    ]);
    const poll = { ...mcq, type: 'POLL' as const, correctIndexes: [] };
    expect(acceptOptions(poll, ['A', 'B'])).toEqual([]);
    const buzzer = { ...mcq, buzzer: { answer: ['A'], wrong: [] } };
    expect(acceptOptions(buzzer, ['A', 'B'])).toEqual([]);
  });

  it('slider: the smallest margin on a step that takes in the closest refused guess', () => {
    const slider = (margin: number, guesses: number[]): QuestionRevealPayload => ({
      type: 'SLIDER',
      correctIndexes: [],
      distribution: [],
      slider: { min: 0, max: 100, step: 5, correct: 50, margin },
      guesses,
    });
    expect(nextSliderMargin(slider(0, [50, 62, 41]))).toBe(10);
    expect(nextSliderMargin(slider(10, [50, 60, 40]))).toBeNull();
    expect(nextSliderMargin(slider(10, [50, 66]))).toBe(20);
    expect(nextSliderMargin(mcq)).toBeNull();
  });

  it('report: the accepted answers in words', () => {
    const q = (details: GameQuestionReport['details']) => ({ choices: ['A', 'B', 'C'], details });
    expect(acceptedText(q({}))).toBeNull();
    expect(acceptedText(q({ accepted: { choiceIndexes: [1, 2] } }))).toBe('B, C');
    expect(acceptedText(q({ accepted: { texts: ['Atlantique'] } }))).toBe('« Atlantique »');
    expect(
      acceptedText(
        q({
          accepted: { margin: 10 },
          slider: { min: 0, max: 100, step: 1, correct: 50, margin: 10, unit: 'ans' },
        }),
      ),
    ).toBe('± 10 ans');
  });
});
