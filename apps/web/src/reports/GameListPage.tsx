import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { GameSummary } from '@lbq/shared';
import { api } from '../api';
import { EditorShell, btn } from '../editor/EditorShell';
import { formatDuration } from './reportStats';
import { JokersBadge, ModeBadge } from './ModeBadge';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** `/reports` — the host's past games, most recent first. */
export function GameListPage() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.games.list().then(setGames, (err: Error) => setError(err.message));
  }, []);

  return (
    <EditorShell>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <h1 className="mb-4 text-3xl font-black">Mes parties</h1>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-4 py-3 font-semibold text-answer-red"
          >
            {error}
          </p>
        )}
        {games === null && !error && <p className="text-gray-500">Chargement…</p>}
        {games?.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="mb-1 text-lg text-gray-600">Aucune partie pour l'instant.</p>
            <p className="mb-4 text-sm text-gray-500">
              Les parties que tu animes connecté(e) apparaissent ici une fois terminées.
            </p>
            <Link to="/editor" className={btn.primary}>
              Lancer un quiz
            </Link>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {games?.map((g) => {
            const duration = formatDuration(g);
            return (
              <li key={g.id}>
                <Link
                  to={`/reports/${g.id}`}
                  className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm hover:ring-2 hover:ring-brand/30 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-lg font-bold">
                      <span className="truncate">{g.quizTitle}</span>
                      <ModeBadge mode={g.mode} />
                      {g.jokers && <JokersBadge />}
                    </p>
                    <p className="text-sm text-gray-500">
                      {dateFmt.format(new Date(g.startedAt))}
                      {duration && ` · ${duration}`} · PIN {g.pin}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">
                      <strong className="text-gray-900">{g.playerCount}</strong> joueur
                      {g.playerCount > 1 ? 's' : ''}
                    </span>
                    <span className="min-w-0 truncate rounded-full bg-answer-yellow/15 px-3 py-1 font-semibold text-gray-800">
                      🏆 {g.winner ?? '—'}
                    </span>
                    <span aria-hidden="true" className="text-gray-400">
                      ›
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </EditorShell>
  );
}
