import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { orderCells } from '../lib/orderItems';
import { PinMarker, PinPicture, PinZoneMark } from '../components/PinPicture';

/** Report cards of the ORDER / PIN / WHO_OF_US / WORD_CLOUD questions (see `QuestionCard`). */
export function MoreTypeDetails({ q, noAnswer }: { q: GameQuestionReport; noAnswer: number }) {
  const { order, pin, votes, words } = q.details;
  const missing = noAnswer > 0 && (
    <p className="mt-2 text-sm text-gray-500 italic">{noAnswer} sans réponse</p>
  );
  if (order) {
    return (
      <>
        <ol className="flex flex-col gap-1.5 text-sm">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-answer-green font-black text-white">
                {i + 1}
              </span>
              <span className="w-40 shrink-0 truncate font-bold sm:w-56" title={item}>
                {item}
              </span>
              <span className="text-gray-500">
                bien placé par {order.placed[i] ?? 0} / {q.answerCount}
              </span>
            </li>
          ))}
        </ol>
        {order.answers && order.answers.length > 0 && (
          <table className="mt-3 text-sm" data-testid="report-order-answers">
            <tbody>
              {order.answers.map((a, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Avatar id={a.avatar} size="xs" />
                      {a.nickname}
                    </span>
                  </td>
                  <td className="py-0.5 pr-2">
                    {a.order.length === 0 ? (
                      <span className="text-gray-500 italic">pas de réponse</span>
                    ) : (
                      <span className="flex gap-1">
                        {orderCells(a.order).map((c, p) => (
                          <span
                            key={p}
                            className={`flex size-6 items-center justify-center rounded text-xs font-black text-white ${
                              c.right ? 'bg-answer-green' : 'bg-answer-red'
                            }`}
                          >
                            {c.rank}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 pr-2 text-gray-500 tabular-nums">
                    {a.placed} / {order.items.length}
                  </td>
                  <td className="py-0.5 text-right font-bold tabular-nums">{a.points} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {missing}
      </>
    );
  }
  if (pin) {
    return (
      <>
        <PinPicture
          src={pin.imageUrl}
          className="overflow-hidden rounded-lg"
          imgClassName="max-h-64 max-w-full"
        >
          <PinZoneMark zone={pin.zone} className="border-2" />
          {pin.pins.map((p, i) => (
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
        {missing}
      </>
    );
  }
  if (votes) {
    const max = Math.max(1, ...votes.map((v) => v.count));
    return (
      <>
        <ul className="flex flex-col gap-1.5 text-sm">
          {votes.map((v) => (
            <li key={v.nickname} className="flex items-center gap-2">
              <Avatar id={v.avatar} size="xs" />
              <span className="w-32 shrink-0 truncate font-bold sm:w-48">
                {v.count === max && '👑 '}
                {v.nickname}
              </span>
              <span className="h-4 min-w-0 flex-1 rounded bg-gray-100">
                <span
                  className="block h-full rounded bg-brand"
                  style={{ width: `${(v.count / max) * 100}%` }}
                />
              </span>
              <span className="w-6 text-right font-semibold tabular-nums">{v.count}</span>
            </li>
          ))}
        </ul>
        {q.details.majorityBonus && (
          <p className="mt-2 text-sm text-gray-500">Bonus pour les votes de la majorité.</p>
        )}
        {missing}
      </>
    );
  }
  if (words) {
    const max = Math.max(1, ...words.map((w) => w.count));
    return (
      <>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {words.map((w) => (
            <span
              key={w.text}
              title={`× ${w.count}`}
              className="font-black text-brand"
              style={{ fontSize: `${0.875 + (w.count / max) * 1.125}rem` }}
            >
              {w.text}
              {w.count > 1 && <sup className="ml-0.5 text-xs text-gray-500">{w.count}</sup>}
            </span>
          ))}
        </p>
        {missing}
      </>
    );
  }
  return null;
}
