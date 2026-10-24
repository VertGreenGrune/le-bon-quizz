import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { Drawing } from '../components/Drawing';

/** Report of a « Dessine-moi »: the drawing (saved as vector strokes), the word, who found it. */
export function DrawDetails({ q }: { q: GameQuestionReport }) {
  const draw = q.details.draw;
  if (!draw) return <p className="text-sm text-gray-500 italic">Détail indisponible</p>;
  return (
    <div className="flex flex-col gap-3 sm:flex-row" data-testid="draw-report">
      <Drawing
        strokes={draw.strokes}
        label={`Dessin de ${draw.drawer?.nickname ?? 'un joueur'} : ${draw.word}`}
        className="w-full max-w-sm rounded-xl border border-gray-200"
      />
      <div className="flex min-w-0 flex-col gap-2 text-sm">
        <p>
          <span className="text-gray-500">Mot : </span>
          <span className="font-black text-answer-green">{draw.word}</span>
        </p>
        {draw.drawer && (
          <p className="flex items-center gap-2">
            <span className="text-gray-500">Dessiné par</span>
            <Avatar id={draw.drawer.avatar} size="xs" />
            <span className="font-bold">{draw.drawer.nickname}</span>
          </p>
        )}
        {draw.found.length === 0 ? (
          <p className="text-gray-500">Personne n’a trouvé.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {draw.found.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-5 text-right tabular-nums text-gray-400">{i + 1}.</span>
                <Avatar id={p.avatar} size="xs" />
                <span className="font-bold">{p.nickname}</span>
                <span className="tabular-nums text-gray-500">{Math.round(p.ms / 1000)} s</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
