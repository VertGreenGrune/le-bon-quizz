import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { auctionDeltaLabel } from '../lib/auction';

/** « Enchères » (T64): every bid of the question and what it did, biggest first. */
export function AuctionDetails({ q }: { q: GameQuestionReport }) {
  const bids = q.details.auction?.bids;
  if (!bids) return null;
  return (
    <div
      className="mt-3 rounded-lg bg-answer-yellow/10 px-3 py-2 text-sm"
      data-testid="report-auction"
    >
      <p className="mb-1 font-bold text-gray-700">💰 Enchères</p>
      {bids.length === 0 ? (
        <p className="text-gray-500">Personne n’a misé.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {bids.map((b) => (
            <li
              key={b.id}
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${
                b.delta > 0
                  ? 'bg-answer-green/15 text-gray-800'
                  : b.delta < 0
                    ? 'bg-answer-red/15 text-gray-800'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              <Avatar id={b.avatar} size="xs" />
              {b.nickname} · {b.amount} pts → {auctionDeltaLabel(b.delta)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
