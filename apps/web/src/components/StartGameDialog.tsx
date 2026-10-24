import { useEffect, useState } from 'react';
import {
  SHAPES,
  SURVIVAL_DEFAULT_HEARTS,
  SURVIVAL_MAX_HEARTS,
  SURVIVAL_MIN_HEARTS,
  TEAM_NAMES,
  type TeamCount,
} from '@lbq/shared';
import type { GameOptions } from '../lib/gameOptions';
import { ShapeIcon, shapeBg } from './shapes';

const TEAM_COUNTS: TeamCount[] = [2, 3, 4];
const HEARTS = Array.from(
  { length: SURVIVAL_MAX_HEARTS - SURVIVAL_MIN_HEARTS + 1 },
  (_, i) => SURVIVAL_MIN_HEARTS + i,
);

/** "Solo", "Équipes" (+ number of teams) or "Survie" (+ hearts) before creating a game. */
export function StartGameDialog({
  onStart,
  onClose,
}: {
  onStart: (options: GameOptions) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<GameOptions['mode']>('solo');
  const [teamCount, setTeamCount] = useState<TeamCount>(2);
  const [hearts, setHearts] = useState(SURVIVAL_DEFAULT_HEARTS);
  // Jokers are the selling point: on by default.
  const [jokers, setJokers] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choice = (selected: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border-2 p-3 text-center ${
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
          <button
            type="button"
            className={choice(mode === 'survival')}
            aria-pressed={mode === 'survival'}
            onClick={() => setMode('survival')}
          >
            <span className="text-3xl" aria-hidden="true">
              💀
            </span>
            <span className="text-lg font-black">Survie</span>
            <span className="text-sm text-gray-500">Le dernier en vie gagne</span>
          </button>
        </div>

        {mode === 'survival' && (
          <fieldset className="mb-4">
            <legend className="mb-2 font-bold">Cœurs par joueur</legend>
            <div className="flex gap-2">
              {HEARTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={hearts === n}
                  aria-label={`${n} cœur${n > 1 ? 's' : ''}`}
                  onClick={() => setHearts(n)}
                  className={`flex-1 rounded-lg border-2 py-2 text-xl font-black ${
                    hearts === n ? 'border-brand bg-brand text-white' : 'border-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-2xl" aria-hidden="true">
              {'❤️'.repeat(hearts)}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Une mauvaise réponse (ou pas de réponse) coûte un cœur. À zéro, on devient un 👻
              fantôme : on continue à jouer et chaque bonne réponse permet de hanter un vivant (Gel
              ou Brouilleur). Le dernier survivant gagne.
            </p>
          </fieldset>
        )}

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

        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-gray-200 p-3 hover:border-brand/50">
          <input
            type="checkbox"
            checked={jokers}
            onChange={(e) => setJokers(e.target.checked)}
            className="mt-1 size-5 accent-brand"
          />
          <span>
            <span className="font-black">🃏 Jokers</span>
            <span className="block text-sm text-gray-500">
              3 jokers par joueur (50/50, Gel, Copieur, Voleur…), +1 toutes les 3 bonnes réponses
              d'affilée.
            </span>
          </span>
        </label>

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
            onClick={() =>
              onStart({
                ...(mode === 'teams'
                  ? { mode, teamCount }
                  : mode === 'survival'
                    ? { mode, hearts }
                    : { mode }),
                ...(jokers && { jokers: true }),
              })
            }
            className="rounded-lg bg-answer-green px-5 py-2 font-black text-white"
          >
            ▶ Lancer
          </button>
        </div>
      </div>
    </div>
  );
}
