/** « ✅ Accepter » buttons and « Réponse acceptée » tags of the reveal (T44), TV and remote. */

export function AcceptButton({
  onClick,
  label = '✅ Accepter',
  title = 'Accepter aussi cette réponse',
  big = false,
}: {
  onClick: () => void;
  label?: string;
  title?: string;
  /** Remote: a bigger touch target. */
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`shrink-0 rounded-lg border-2 border-white/70 font-bold whitespace-nowrap hover:bg-white/15 active:scale-95 ${
        big ? 'px-4 py-2 text-base' : 'px-2 py-0.5 text-sm'
      }`}
      data-testid="accept-button"
    >
      {label}
    </button>
  );
}

export function AcceptedTag({
  big = false,
  label = '✅ Réponse acceptée',
}: {
  big?: boolean;
  /** Under a distribution bar: « ✅ Acceptée » (narrow). */
  label?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded-lg bg-white font-black whitespace-nowrap text-answer-green ${
        big ? 'px-3 py-1.5 text-base' : 'px-2 py-0.5 text-sm'
      }`}
      data-testid="accepted-tag"
    >
      {label}
    </span>
  );
}
