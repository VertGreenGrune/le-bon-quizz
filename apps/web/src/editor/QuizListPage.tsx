import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { QUIZ_SHARE_ROLE_NAMES, type QuizSummary, type SharedQuizSummary } from '@lbq/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { EditorShell, btn } from './EditorShell';
import { StartGameDialog } from '../components/StartGameDialog';
import { hostUrl } from '../lib/gameOptions';
import { VisibilityBadge } from './visibility';
import { ThemeBadge } from '../themes/ThemePicker';
import { playedLabel } from '../library/format';
import { mediaUrl } from '../lib/mediaUrl';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** `/editor` — the host's quizzes. */
export function QuizListPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Quiz whose "Lancer" was clicked: the Solo / Équipes dialog is open. */
  const [launchId, setLaunchId] = useState<string | null>(null);
  /** T45: quizzes other hosts shared with me. */
  const [shared, setShared] = useState<SharedQuizSummary[] | null>(null);
  const { user } = useAuth();

  const load = useCallback(() => {
    setError(null);
    api.quizzes.list().then(setQuizzes, (err: Error) => setError(err.message));
    api.quizzes.shared().then(setShared, (err: Error) => setError(err.message));
  }, []);
  const launchTheme = (quizzes ?? []).concat(shared ?? []).find((q) => q.id === launchId)?.theme;
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
                  src={mediaUrl(q.coverImageUrl)}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="hidden h-16 w-24 shrink-0 rounded-lg bg-brand/10 sm:block" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/editor/${q.id}`}
                    className="block truncate text-lg font-bold hover:underline"
                  >
                    {q.title}
                  </Link>
                  <VisibilityBadge visibility={q.visibility} />
                  <ThemeBadge theme={q.theme} />
                </div>
                <p className="text-sm text-gray-500">
                  {q.questionCount} question{q.questionCount > 1 ? 's' : ''} ·{' '}
                  {playedLabel(q.playCount)} · modifié le {dateFmt.format(new Date(q.updatedAt))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" className={btn.start} onClick={() => setLaunchId(q.id)}>
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

        {shared && shared.length > 0 && (
          <section className="mt-8" aria-labelledby="shared-title">
            <h2 id="shared-title" className="mb-1 text-2xl font-black">
              👥 Partagés avec moi
            </h2>
            <p className="mb-3 text-sm text-gray-500">
              Quiz que d’autres animateurs t’ont partagés.
            </p>
            <ul className="flex flex-col gap-3">
              {shared.map((q) => (
                <li
                  key={q.id}
                  data-testid="shared-quiz"
                  className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  {q.coverImageUrl ? (
                    <img
                      src={mediaUrl(q.coverImageUrl)}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="hidden h-16 w-24 shrink-0 rounded-lg bg-brand/10 sm:block" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        to={`/editor/${q.id}`}
                        className="block truncate text-lg font-bold hover:underline"
                      >
                        {q.title}
                      </Link>
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                        {q.role === 'editor' ? '✏️' : '▶'} {QUIZ_SHARE_ROLE_NAMES[q.role]}
                      </span>
                      <ThemeBadge theme={q.theme} />
                    </div>
                    <p className="text-sm text-gray-500">
                      de {q.ownerName} · {q.questionCount} question{q.questionCount > 1 ? 's' : ''}{' '}
                      · modifié le {dateFmt.format(new Date(q.updatedAt))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" className={btn.start} onClick={() => setLaunchId(q.id)}>
                      ▶ Lancer
                    </button>
                    <Link to={`/editor/${q.id}`} className={btn.ghost}>
                      {q.role === 'editor' ? 'Modifier' : 'Voir'}
                    </Link>
                    <button
                      type="button"
                      className={btn.ghost}
                      disabled={busyId === q.id}
                      onClick={() => run(q.id, () => api.quizzes.duplicate(q.id))}
                    >
                      Copier dans mes quiz
                    </button>
                    {user && (
                      <button
                        type="button"
                        className={btn.danger}
                        disabled={busyId === q.id}
                        onClick={() => {
                          if (
                            confirm(
                              `Ne plus voir « ${q.title} » ? Son auteur devra te le repartager.`,
                            )
                          ) {
                            void run(q.id, () => api.quizzes.unshare(q.id, user.id));
                          }
                        }}
                      >
                        Ne plus voir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      {launchId && (
        <StartGameDialog
          quizTheme={launchTheme}
          onStart={(options) => navigate(hostUrl(launchId, options))}
          onClose={() => setLaunchId(null)}
        />
      )}
    </EditorShell>
  );
}
