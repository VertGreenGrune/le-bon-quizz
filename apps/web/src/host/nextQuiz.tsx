import { useEffect, useState } from 'react';
import { DEFAULT_TEAM_COUNT, DEMO_QUIZ, type QuizTheme, type TeamCount } from '@lbq/shared';
import { api, ApiError } from '../api';
import { StartGameDialog } from '../components/StartGameDialog';
import type { GameOptions } from '../lib/gameOptions';
import { ThemeBadge } from '../themes/ThemePicker';
import type { HostGameState } from './hostReducer';

/** A quiz the host can pick for the next round (« 🔁 Quiz suivant », T47). */
export interface PickableQuiz {
  id: string;
  title: string;
  theme: QuizTheme;
  questionCount: number;
  /** Shared or library quiz: who made it. */
  author?: string;
}

export type PickerTab = 'mine' | 'shared' | 'library' | 'demo';

const TABS: { id: PickerTab; label: string }[] = [
  { id: 'mine', label: 'Mes quiz' },
  { id: 'shared', label: '👥 Partagés avec moi' },
  { id: 'library', label: 'Bibliothèque' },
  { id: 'demo', label: 'Démo' },
];

export const DEMO_PICK: PickableQuiz = {
  id: DEMO_QUIZ.id,
  title: DEMO_QUIZ.title,
  theme: DEMO_QUIZ.theme ?? 'classic',
  questionCount: DEMO_QUIZ.questions.length,
};

/** The options of the game on screen, to preselect them for the next quiz. */
export function currentOptions(state: HostGameState): GameOptions {
  const jokers = state.jokers ? { jokers: true as const } : {};
  if (state.mode === 'teams') {
    const n = Math.min(4, Math.max(2, state.teams.length || DEFAULT_TEAM_COUNT));
    return { mode: 'teams', teamCount: n as TeamCount, ...jokers };
  }
  if (state.mode === 'survival')
    return {
      mode: 'survival',
      ...(state.survival && { hearts: state.survival.hearts }),
      ...jokers,
    };
  return { mode: 'solo', ...jokers };
}

async function loadTab(tab: PickerTab, search: string): Promise<PickableQuiz[]> {
  switch (tab) {
    case 'demo':
      return [DEMO_PICK];
    case 'mine':
      return (await api.quizzes.list()).map((q) => ({ ...q }));
    case 'shared':
      return (await api.quizzes.shared()).map((q) => ({ ...q, author: q.ownerName }));
    case 'library':
      return (await api.library.list({ search: search.trim() || undefined })).map((q) => ({
        ...q,
        author: q.authorName,
      }));
  }
}

/**
 * TV, PODIUM / ENDED: « 🔁 Quiz suivant » — pick a quiz (own, shared, library or the demo) then its
 * options; the players stay in the room. « ↻ Rejouer ce quiz » replays the same one.
 */
export function NextQuizDialog({
  state,
  currentTitle,
  onReplay,
  onPick,
  onClose,
}: {
  state: HostGameState;
  currentTitle: string | null;
  onReplay: () => void;
  onPick: (quizId: string, options: GameOptions) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PickerTab>('mine');
  const [search, setSearch] = useState('');
  const [quizzes, setQuizzes] = useState<PickableQuiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const [picked, setPicked] = useState<PickableQuiz | null>(null);

  useEffect(() => {
    let cancelled = false;
    setQuizzes(null);
    setError(null);
    const timer = setTimeout(
      () => {
        loadTab(tab, search).then(
          (list) => !cancelled && setQuizzes(list),
          (err: unknown) => {
            if (cancelled) return;
            if (err instanceof ApiError && err.status === 401) {
              // Anonymous host: only the demo.
              setLoggedOut(true);
              setTab('demo');
            } else setError(err instanceof ApiError ? err.message : 'Chargement impossible');
          },
        );
      },
      tab === 'library' ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !picked && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, picked]);

  if (picked)
    return (
      <StartGameDialog
        title={picked.title}
        quizTheme={picked.theme}
        initial={currentOptions(state)}
        onClose={() => setPicked(null)}
        onStart={(options) => onPick(picked.id, options)}
      />
    );

  const tabs = loggedOut ? TABS.filter((t) => t.id === 'demo') : TABS;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="next-quiz-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 text-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="next-quiz-title" className="text-2xl font-black">
          🔁 Quiz suivant
        </h2>
        <p className="mb-4 text-gray-600">
          Les joueurs restent dans la salle : pas besoin de retaper le code.
        </p>
        <button
          type="button"
          onClick={onReplay}
          className="mb-4 rounded-xl border-2 border-brand px-4 py-3 text-left text-lg font-black text-brand hover:bg-brand/10"
        >
          ↻ Rejouer ce quiz{currentTitle ? ` (${currentTitle})` : ''}
        </button>
        <div role="tablist" className="mb-3 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 font-bold ${
                tab === t.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {loggedOut && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Sans compte, seul le quiz de démo est disponible.{' '}
            <a href="/login" target="_blank" rel="noreferrer" className="font-bold underline">
              Se connecter
            </a>{' '}
            pour choisir parmi vos quiz.
          </p>
        )}
        {tab === 'library' && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un quiz…"
            aria-label="Rechercher un quiz"
            className="mb-3 rounded-lg border-2 border-gray-200 px-3 py-2 outline-none focus:border-brand"
          />
        )}
        <div className="min-h-32 flex-1 overflow-y-auto">
          {error && <p className="text-red-600">{error}</p>}
          {!error && quizzes === null && <p className="text-gray-500">Chargement…</p>}
          {quizzes?.length === 0 && <p className="text-gray-500">Aucun quiz ici.</p>}
          <ul className="flex flex-col gap-2">
            {quizzes?.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setPicked(q)}
                  className="flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3 text-left hover:border-brand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-black">{q.title}</span>
                    <span className="text-sm text-gray-500">
                      {q.questionCount} question{q.questionCount > 1 ? 's' : ''}
                      {q.author && ` · par ${q.author}`}
                    </span>
                  </span>
                  <ThemeBadge theme={q.theme} />
                  <span className="font-black text-brand">Choisir ›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex justify-end">
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
