import type { QuizVisibility } from '@lbq/shared';

const OPTIONS: { value: QuizVisibility; icon: string; label: string }[] = [
  { value: 'PRIVATE', icon: '🔒', label: 'Privé' },
  { value: 'PUBLIC', icon: '🌐', label: 'Public' },
];

const HELP: Record<QuizVisibility, string> = {
  PRIVATE: 'Privé : toi seul peux lancer ce quiz.',
  PUBLIC:
    'Public : les autres animateurs pourront lancer ce quiz. Ils ne pourront pas le modifier.',
};

/** "Visibilité : Privé / Public" switch of the quiz form. */
export function VisibilityField({
  value,
  onChange,
}: {
  value: QuizVisibility;
  onChange: (value: QuizVisibility) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span id="visibility-label" className="text-sm font-bold text-gray-600">
        Visibilité
      </span>
      <div
        role="radiogroup"
        aria-labelledby="visibility-label"
        className="flex w-fit rounded-lg border-2 border-gray-300 p-0.5"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-4 py-1.5 font-bold ${
              value === o.value ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span aria-hidden="true">{o.icon}</span> {o.label}
          </button>
        ))}
      </div>
      <span className="text-sm text-gray-500">{HELP[value]}</span>
    </div>
  );
}

/** 🌐 Public / 🔒 Privé badge of "Mes quiz". */
export function VisibilityBadge({ visibility }: { visibility: QuizVisibility }) {
  const o = OPTIONS.find((x) => x.value === visibility)!;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        visibility === 'PUBLIC' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
      }`}
    >
      <span aria-hidden="true">{o.icon}</span> {o.label}
    </span>
  );
}
