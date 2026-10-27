import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LibraryQuiz, LibrarySort, QuizDetail } from '@lbq/shared';
import { api } from '../api';
import { EditorShell, btn } from '../editor/EditorShell';
import { StartGameDialog } from '../components/StartGameDialog';
import { hostUrl } from '../lib/gameOptions';
import { ThemeBadge } from '../themes/ThemePicker';
import { playedLabel } from './format';
import { mediaUrl } from '../lib/mediaUrl';

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'popular', label: 'Les plus joués' },
  { value: 'newest', label: 'Les plus récents' },
];

/** Typing pause before the search is sent. */
const SEARCH_DELAY_MS = 300;

/** `/library` — public quizzes of the other hosts: launch one, or copy it to edit it. */
export function LibraryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('popular');
  const [quizzes, setQuizzes] = useState<LibraryQuiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Last "Copier dans mes quiz" result, with a link to edit the copy. */
  const [copied, setCopied] = useState<QuizDetail | null>(null);
  /** Quiz whose "Lancer" was clicked: the Solo / Équipes dialog is open. */
  const [launchId, setLaunchId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        setError(null);
        api.library.list({ search, sort }).then(
          (list) => current && setQuizzes(list),
          (err: Error) => current && setError(err.message),
        );
      },
      search ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search, sort]);

  async function copy(q: LibraryQuiz) {
    setBusyId(q.id);
    setError(null);
    setCopied(null);
    try {
      setCopied(await api.library.copy(q.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <EditorShell>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        <h1 className="text-3xl font-black">Bibliothèque</h1>
        <p className="mb-4 text-gray-600">
          Les quiz publics des autres animateurs : lance-les tels quels, ou copie-les dans tes quiz
          pour les modifier.
        </p>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={95}
            placeholder="Rechercher un quiz par titre…"
            aria-label="Rechercher un quiz par titre"
            className="flex-1 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 outline-none focus:border-brand"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as LibrarySort)}
            aria-label="Trier"
            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-4 py-3 font-semibold text-answer-red"
          >
            {error}
          </p>
        )}
        {copied && (
          <p
            role="status"
            className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-green-50 px-4 py-3 font-semibold text-answer-green"
          >
            « {copied.title} » a été ajouté à tes quiz (privé).
            <Link to={`/editor/${copied.id}`} className="underline">
              Modifier la copie
            </Link>
          </p>
        )}
        {quizzes === null && !error && <p className="text-gray-500">Chargement…</p>}
        {quizzes?.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-lg text-gray-600">
              {search.trim()
                ? `Aucun quiz public ne correspond à « ${search.trim()} ».`
                : "Aucun quiz public pour l'instant."}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Rends un de tes quiz public pour le partager avec les autres animateurs.
            </p>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes?.map((q) => (
            <li key={q.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
              {q.coverImageUrl ? (
                <img src={mediaUrl(q.coverImageUrl)} alt="" className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-36 items-center justify-center bg-brand/10 text-5xl">
                  <span aria-hidden="true">🌐</span>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h2 className="text-lg leading-tight font-bold">{q.title}</h2>
                <p className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  par {q.authorName}
                  <ThemeBadge theme={q.theme} />
                </p>
                {q.description && (
                  <p className="line-clamp-2 text-sm text-gray-600">{q.description}</p>
                )}
                <p className="mt-auto pt-2 text-sm text-gray-500">
                  {q.questionCount} question{q.questionCount > 1 ? 's' : ''} ·{' '}
                  {playedLabel(q.playCount)}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" className={btn.start} onClick={() => setLaunchId(q.id)}>
                    ▶ Lancer
                  </button>
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busyId === q.id}
                    onClick={() => void copy(q)}
                  >
                    Copier dans mes quiz
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
      {launchId && (
        <StartGameDialog
          quizTheme={quizzes?.find((q) => q.id === launchId)?.theme}
          onStart={(options) => navigate(hostUrl(launchId, options))}
          onClose={() => setLaunchId(null)}
        />
      )}
    </EditorShell>
  );
}
