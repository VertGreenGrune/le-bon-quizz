import { useState } from 'react';
import { MAX_ANSWER_CANCELS } from '@lbq/shared';
import { canCancelAnswer, type PlayerState } from './playerState';
import { cancelAnswer } from './playerStore';

/**
 * « ↩︎ Annuler ma réponse » (T43) on the « Réponse envoyée ! » screen: one tap, no confirmation,
 * back to the answer screen (the new answer is scored from its own time).
 */
export function CancelAnswerButton({ s }: { s: PlayerState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canCancelAnswer(s)) return error ? <p className="text-sm font-bold">{error}</p> : null;
  const left = s.cancels?.questionIndex === s.questionIndex ? s.cancels.left : MAX_ANSWER_CANCELS;
  return (
    <div className="relative flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await cancelAnswer());
          setBusy(false);
        }}
        className="rounded-full border-2 border-white/70 bg-white/10 px-5 py-2.5 text-base font-bold active:scale-95 disabled:opacity-60"
      >
        ↩︎ Annuler ma réponse
      </button>
      {left < MAX_ANSWER_CANCELS && (
        <p className="text-xs font-semibold opacity-75">
          {left === 1 ? 'Dernière annulation possible' : `Encore ${left} annulations possibles`}
        </p>
      )}
      {error && <p className="text-sm font-bold">{error}</p>}
    </div>
  );
}
