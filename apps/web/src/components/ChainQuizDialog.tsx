import { useEffect, useState } from 'react';
import type { ChainQuiz } from '@lbq/shared';
import type { ChainActions } from '../lib/chain';
import { mediaUrl } from '../lib/mediaUrl';
import { THEMES } from '../themes';
import { StartGameDialog } from './StartGameDialog';

/**
 * « 🔁 Enchaîner un quiz » (T48): pick one of the host's quizzes, then the usual options. The
 * room (PIN, TV, remote, players) stays; scores start again from 0.
 */
export function ChainQuizDialog({
  actions,
  onClose,
}: {
  actions: ChainActions;
  onClose: () => void;
}) {
  const [quizzes, setQuizzes] = useState<ChainQuiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ChainQuiz | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void actions.listQuizzes().then((res) => {
      if (!alive) return;
      if (typeof res === 'string') setError(res);
      else setQuizzes(res);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (picked) return; // the options dialog handles Escape
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, picked]);

  if (picked) {
    return (
      <StartGameDialog
        quizTheme={picked.theme}
        onClose={() => (busy ? undefined : setPicked(null))}
        onStart={(options) => {
          if (busy) return;
          setBusy(true);
          void actions.chain(picked.id, options).then((err) => {
            setBusy(false);
            if (err) {
              setError(err);
              setPicked(null);
            } else onClose();
          });
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chain-quiz-title"
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 text-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="chain-quiz-title" className="text-2xl font-black">
          🔁 Enchaîner un quiz
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Même PIN, même TV, mêmes joueurs : les scores repartent de zéro.
        </p>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-answer-red/10 p-3 font-semibold text-answer-red"
          >
            {error}
          </p>
        )}
        {!quizzes && !error && <p className="py-6 text-center text-gray-500">Chargement…</p>}
        {quizzes && (
          <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Quiz">
            {quizzes.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPicked(q);
                  }}
                  className="mb-2 flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 p-3 text-left hover:border-brand"
                >
                  {q.coverImageUrl ? (
                    <img
                      src={mediaUrl(q.coverImageUrl)}
                      alt=""
                      className="size-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-2xl">
                      {THEMES[q.theme].icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">{q.title}</span>
                    <span className="block text-sm text-gray-500">
                      {q.questionCount} question{q.questionCount > 1 ? 's' : ''}
                      {q.ownerName && ` · de ${q.ownerName}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 font-bold text-gray-600 hover:bg-gray-100"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
