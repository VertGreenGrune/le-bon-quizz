import { acceptKind, type QuestionRevealPayload } from '@lbq/shared';

/** What the host accepts with « ✅ Accepter » (T44): `host:accept` without pin / token / index. */
export type AcceptInput = { choiceIndex: number } | { text: string } | { margin: number };

/** One answer the host may accept, as listed on the remote (and the TV for typed answers). */
export interface AcceptOption {
  key: string;
  /** Choice text, or the typed answer as the first player typed it. */
  label: string;
  /** Choice questions: the shape index. */
  shape?: number;
  count: number;
  /** Already right (quiz's answer, or accepted). */
  right: boolean;
  /** Made right by the host. */
  accepted: boolean;
  input: AcceptInput;
}

/**
 * Answers of a revealed question the host may accept: every choice (MCQ, vrai / faux) or every
 * typed group (réponse libre, all of them — not only the top 6). Empty for the other types and
 * for « Buzzer » questions.
 */
export function acceptOptions(reveal: QuestionRevealPayload, choices: string[]): AcceptOption[] {
  const kind = acceptKind({ type: reveal.type, buzzer: !!reveal.buzzer });
  if (kind === 'choice') {
    const accepted = reveal.accepted?.choiceIndexes ?? [];
    return choices.map((label, i) => ({
      key: `choice-${i}`,
      label,
      shape: i,
      count: reveal.distribution[i] ?? 0,
      right: reveal.correctIndexes.includes(i),
      accepted: accepted.includes(i),
      input: { choiceIndex: i },
    }));
  }
  if (kind === 'text')
    return (reveal.typedAnswers ?? reveal.topAnswers ?? []).map((g, i) => ({
      key: `text-${i}-${g.text}`,
      label: g.text,
      count: g.count,
      right: g.correct,
      accepted: !!g.accepted,
      input: { text: g.text },
    }));
  return [];
}

/**
 * Curseur: the smallest wider margin (on a step) that takes in the closest refused guess, or
 * null when every guess is already inside (or the reveal isn't a slider one).
 */
export function nextSliderMargin(reveal: QuestionRevealPayload): number | null {
  const slider = reveal.slider;
  if (!slider || reveal.buzzer || acceptKind({ type: reveal.type }) !== 'margin') return null;
  const outside = (reveal.guesses ?? [])
    .map((g) => Math.abs(g - slider.correct))
    .filter((d) => d > slider.margin + 1e-9);
  if (outside.length === 0) return null;
  const steps = Math.ceil(Math.min(...outside) / slider.step - 1e-9);
  return Number((steps * slider.step).toFixed(10));
}
