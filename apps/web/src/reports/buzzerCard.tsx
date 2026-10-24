import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/** Report of a « Buzzer » question: the answer, who found it, who buzzed and got it wrong. */
export function BuzzerDetails({ q }: { q: GameQuestionReport }) {
  const buzzer = q.details.buzzer;
  if (!buzzer) return null;
  return (
    <div className="flex flex-col gap-1.5 text-sm" data-testid="buzzer-report">
      <p>
        <span className="font-bold text-gray-600">Réponse : </span>
        <span className="font-bold text-answer-green">{buzzer.answer.join(' · ')}</span>
      </p>
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-gray-600">Trouvée par :</span>
        {buzzer.winner ? (
          <span className="flex items-center gap-1 font-bold">
            <Avatar id={buzzer.winner.avatar} size="xs" />
            {buzzer.winner.nickname}
          </span>
        ) : (
          <span className="text-gray-500 italic">personne</span>
        )}
      </p>
      {buzzer.wrong.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-gray-600">Mauvaises réponses :</span>
          {buzzer.wrong.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-gray-500">
              <Avatar id={p.avatar} size="xs" className="grayscale" />
              {p.nickname}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
