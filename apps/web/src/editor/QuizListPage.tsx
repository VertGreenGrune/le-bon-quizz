import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { QuizSummary } from '@lbq/shared';
import { api } from '../api';
import { EditorShell, btn } from './EditorShell';
import { hostUrl } from './hostUrl';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** `/editor` — the host's quizzes. */
export function QuizListPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.quizzes.list().then(setQuizzes, (err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <EditorShell
      actions={
        <Link to="/editor/new" className="rounded-lg bg-white px-4 py-1.5 font-bold text-brand">
          + Nouveau quiz
        </Link>
      }
    >
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <h1 className="mb-4 text-3xl font-black">Mes quiz</h1>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-4 py-3 font-semibold text-answer-red"
          >
            {error}
          </p>
        )}
        {quizzes === null && !error && <p className="text-gray-500">Chargement…</p>}
        {quizzes?.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-lg text-gray-600">Tu n'as pas encore de quiz.</p>
            <Link to="/editor/new" className={btn.primary}>
              Créer mon premier quiz
            </Link>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {quizzes?.map((q) => (
            <li
              key={q.id}
              className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center"
            >
              {q.coverImageUrl ? (
                <img
                  src={q.coverImageUrl}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="hidden h-16 w-24 shrink-0 rounded-lg bg-brand/10 sm:block" />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to={`/editor/${q.id}`}
                  className="block truncate text-lg font-bold hover:underline"
                >
                  {q.title}
                </Link>
                <p className="text-sm text-gray-500">
                  {q.questionCount} question{q.questionCount > 1 ? 's' : ''} · modifié le{' '}
                  {dateFmt.format(new Date(q.updatedAt))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" className={btn.start} onClick={() => navigate(hostUrl(q.id))}>
                  ▶ Lancer
                </button>
                <Link to={`/editor/${q.id}`} className={btn.ghost}>
                  Modifier
                </Link>
                <button
                  type="button"
                  className={btn.ghost}
                  disabled={busyId === q.id}
                  onClick={() => run(q.id, () => api.quizzes.duplicate(q.id))}
                >
                  Dupliquer
                </button>
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busyId === q.id}
                  onClick={() => {
                    if (confirm(`Supprimer « ${q.title} » ? Cette action est définitive.`)) {
                      void run(q.id, () => api.quizzes.remove(q.id));
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </EditorShell>
  );
}
