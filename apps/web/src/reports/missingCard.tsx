import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { PinMarker, PinPicture, PinZoneMark } from '../components/PinPicture';
import { missingFoundLine } from '../lib/missing';

/** « Qu'est-ce qui a disparu ? » (T59) in the report: « avant » with the zone and every pin, « après ». */
export function MissingDetails({ q }: { q: GameQuestionReport }) {
  const missing = q.details.missing;
  if (!missing) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-3">
        <figure className="flex flex-col gap-1">
          <PinPicture
            src={missing.imageUrl}
            className="overflow-hidden rounded-lg"
            imgClassName="max-h-64 max-w-full"
          >
            <PinZoneMark zone={missing.zone} className="border-2" />
            {missing.pins.map((p, i) => (
              <PinMarker key={i} point={p}>
                <span
                  title={`${p.nickname}${p.correct ? ' ✓' : ''}`}
                  className={`block rounded-full ring-2 ${p.correct ? 'ring-answer-green' : 'ring-white'}`}
                >
                  <Avatar id={p.avatar} size="xs" />
                </span>
              </PinMarker>
            ))}
          </PinPicture>
          <figcaption className="text-xs font-semibold text-gray-500">Avant</figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <PinPicture
            src={missing.missingImageUrl}
            className="overflow-hidden rounded-lg"
            imgClassName="max-h-32 max-w-full"
          />
          <figcaption className="text-xs font-semibold text-gray-500">Après</figcaption>
        </figure>
      </div>
      <p className="text-sm font-semibold text-gray-600">{missingFoundLine(missing)}</p>
    </div>
  );
}
