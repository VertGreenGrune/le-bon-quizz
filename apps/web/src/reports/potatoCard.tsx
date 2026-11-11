import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { passesLabel } from '../lib/potato';

/**
 * « Patate chaude » (T63) in the report: who exploded, how many sub-questions were asked, every
 * player's passes and points.
 */
export function PotatoDetails({ q }: { q: GameQuestionReport }) {
  const p = q.details.potato;
  if (!p) return <p className="text-sm text-gray-500 italic">Détail indisponible</p>;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="potato-report">
      <p className="font-bold">
        {p.loser ? (
          <>
            💥 <Avatar id={p.loser.avatar} size="xs" className="mr-1 align-middle" />
            {p.loser.nickname} a explosé avec la patate
          </>
        ) : (
          <span className="font-normal text-gray-500 italic">Pas de partie (un seul joueur)</span>
        )}
        <span className="font-normal text-gray-500">
          {' '}
          · {p.asked} petite{p.asked > 1 ? 's' : ''} question{p.asked > 1 ? 's' : ''} posée
          {p.asked > 1 ? 's' : ''}
        </span>
      </p>
      <ul className="flex flex-col gap-1">
        {p.players.map((player) => (
          <li key={player.id} className="flex items-center gap-2">
            <Avatar id={player.avatar} size="xs" />
            <span className="font-semibold">{player.nickname}</span>
            <span className="text-gray-500">{passesLabel(player.passes)}</span>
            <span className="ml-auto font-bold tabular-nums">+ {player.points} pts</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
