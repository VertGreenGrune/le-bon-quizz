import type { QuestionShowPayload, QuestionType } from '@lbq/shared';
import { QUESTION_TYPES } from '../editor/draft';

const ICONS: Record<QuestionType, string> = {
  MCQ: '🔷',
  TRUE_FALSE: '⚖️',
  TYPE_ANSWER: '⌨️',
  SLIDER: '🎚️',
  POLL: '📊',
  ORDER: '🔢',
  PIN: '📍',
  WHO_OF_US: '👥',
  WORD_CLOUD: '☁️',
  BLUFF: '🤥',
  DRAW: '🎨',
  LIST: '📝',
  COLORS: '🖍️',
  MISSING: '🔍',
  POINTLESS: '💎',
  WAGER: '💰',
};

/** « 🎚️ Curseur », « 🔔 Buzzer · Réponse libre »… — the type shown on the TV. */
export function questionTypeLabel(question: Pick<QuestionShowPayload, 'type' | 'buzzer'>): string {
  const label = QUESTION_TYPES.find((t) => t.type === question.type)?.label ?? question.type;
  return question.buzzer ? `🔔 Buzzer · ${label}` : `${ICONS[question.type]} ${label}`;
}

export function QuestionTypeBadge({
  question,
  className = '',
}: {
  question: Pick<QuestionShowPayload, 'type' | 'buzzer'>;
  className?: string;
}) {
  return (
    <span
      data-testid="question-type"
      className={`rounded-full bg-panel px-5 py-1.5 font-display font-bold whitespace-nowrap ${className}`}
    >
      {questionTypeLabel(question)}
    </span>
  );
}
