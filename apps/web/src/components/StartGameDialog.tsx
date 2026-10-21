import { useEffect, useState } from 'react';
import { SHAPES, TEAM_NAMES, type TeamCount } from '@lbq/shared';
import type { GameOptions } from '../lib/gameOptions';
import { ShapeIcon, shapeBg } from './shapes';

const TEAM_COUNTS: TeamCount[] = [2, 3, 4];

/** "Solo" or "Équipes" (+ number of teams) before creating a game. */
export function StartGameDialog({
  onStart,
  onClose,
}: {
  onStart: (options: GameOptions) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<GameOptions['mode']>('solo');
  const [teamCount, setTeamCount] = useState<TeamCount>(2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choice = (selected: boolean) =>
    `flex flex-1 flex-col items-center gap-1 rounded-xl border-2 p-4 text-center ${
      selected ? 'border-brand bg-brand/10' : 'border-gray-200 hover:border-brand/50'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-game-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="start-game-title" className="mb-4 text-2xl font-black">
          Nouvelle partie
        </h2>
        <div className="mb-4 flex gap-3">
          <button
            type="button"
            className={choice(mode === 'solo')}
            aria-pressed={mode === 'solo'}
            onClick={() => setMode('solo')}
          >
            <span className="text-3xl" aria-hidden="true">
              🙋
            </span>
            <span className="text-lg font-black">Solo</span>
            <span className="text-sm text-gray-500">Chacun pour soi</span>
          </button>
          <button
            type="button"
            className={choice(mode === 'teams')}
            aria-pressed={mode === 'teams'}
            onClick={() => setMode('teams')}
          >
            <span className="text-3xl" aria-hidden="true">
              👥
            </span>
            <span className="text-lg font-black">Équipes</span>
            <span className="text-sm text-gray-500">Les joueurs choisissent leur équipe</span>
          </button>
        </div>

        {mode === 'teams' && (
          <fieldset className="mb-4">
            <legend className="mb-2 font-bold">Nombre d'équipes</legend>
            <div className="flex gap-2">
              {TEAM_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={teamCount === n}
                  onClick={() => setTeamCount(n)}
                  className={`flex-1 rounded-lg border-2 py-2 text-xl font-black ${
                    teamCount === n ? 'border-brand bg-brand text-white' : 'border-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Équipes">
              {SHAPES.slice(0, teamCount).map((s) => (
                <span
                  key={s.index}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-white ${shapeBg[s.color]}`}
                >
                  <ShapeIcon shape={s.shape} className="size-4 fill-white" />
                  {TEAM_NAMES[s.index]}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Score d'équipe = moyenne des points par joueur : équitable même si les équipes n'ont
              pas la même taille.
            </p>
          </fieldset>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 font-bold text-gray-600 hover:bg-gray-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onStart(mode === 'teams' ? { mode, teamCount } : { mode })}
            className="rounded-lg bg-answer-green px-5 py-2 font-black text-white"
          >
            ▶ Lancer
          </button>
        </div>
      </div>
    </div>
  );
}
