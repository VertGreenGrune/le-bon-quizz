import { expect, type Page } from '@playwright/test';
import { SHAPES, type Question } from '@lbq/shared';

/** `right` / `wrong` answer, or a `vote` for a poll (which has no right answer). */
export type Plan = 'right' | 'wrong' | 'vote';

/** Answers `question` on a phone (shape button, typed text or slider), following `plan`. */
export async function answerOnPhone(phone: Page, question: Question, plan: Plan): Promise<void> {
  switch (question.type) {
    case 'TYPE_ANSWER': {
      const field = phone.getByRole('textbox', { name: 'Ta réponse' });
      await expect(field).toBeFocused(); // keyboard opens by itself
      await field.fill(
        plan === 'right' ? question.acceptedAnswers[0]!.toLowerCase() : 'Atlantique',
      );
      await phone.getByRole('button', { name: 'Valider' }).click();
      return;
    }
    case 'SLIDER': {
      const { correct, margin, min, max, step } = question.slider;
      // Right: a few steps off, still inside the margin. Wrong: the far end of the range.
      const value =
        plan === 'right'
          ? Math.min(max, correct + Math.floor(margin / step) * step)
          : correct - min > max - correct
            ? min
            : max;
      await phone.getByRole('slider', { name: 'Ta valeur' }).fill(String(value));
      await phone.getByRole('button', { name: 'Valider' }).click();
      return;
    }
    default: {
      const buttons = phone.getByRole('button', { name: /^Réponse / });
      await expect(buttons).toHaveCount(question.choices.length);
      const index =
        question.type === 'POLL'
          ? 0
          : question.choices.findIndex((c) => c.isCorrect === (plan === 'right'));
      await phone.getByRole('button', { name: `Réponse ${SHAPES[index]!.symbol}` }).click();
    }
  }
}

/** Result heading the phone shows after the reveal. */
export function resultHeading(question: Question, plan: Plan): string {
  if (question.type === 'POLL') return 'Merci pour ton vote !';
  return plan === 'right' ? 'Correct !' : 'Raté !';
}

/** Checks the type-specific reveal on the shared screen. */
export async function expectHostReveal(host: Page, question: Question): Promise<void> {
  if (question.type === 'TYPE_ANSWER')
    await expect(host.getByText(`✓ ${question.acceptedAnswers.join(' · ')}`)).toBeVisible();
  else if (question.type === 'SLIDER')
    await expect(host.getByText(/Le plus proche : Alice/)).toBeVisible();
  else if (question.type === 'POLL') await expect(host.getByText(/\d+ %/).first()).toBeVisible();
}
