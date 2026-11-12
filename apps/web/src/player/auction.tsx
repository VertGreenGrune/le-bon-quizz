import { useState } from 'react';
import { motion } from 'framer-motion';
import { AUCTION_STEP } from '@lbq/shared';
import { auctionResultLine, clampBid, quickBids } from '../lib/auction';
import type { PlayerState } from './playerState';
import { sendBid } from './playerStore';

/**
 * « Enchères » (T64), the bid stage: the topic, a secret bid (0 … max by 50) sent on « Miser »,
 * changeable until the stage ends.
 */
export function BidPad({ s }: { s: PlayerState }) {
  const auction = s.auction;
  const bid = s.bid?.questionIndex === s.questionIndex ? s.bid : null;
  const max = bid?.max ?? 0;
  const [amount, setAmount] = useState(bid?.amount ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sent = bid?.amount ?? 0;
  const place = async (value: number) => {
    setSending(true);
    setError(null);
    setError(await sendBid(value));
    setSending(false);
  };
  return (
    <div
      data-testid="bid-pad"
      className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-4 overflow-y-auto p-5 text-center"
    >
      <h2 className="text-3xl font-black">💰 Enchères&nbsp;!</h2>
      {auction && (
        <p className="rounded-2xl bg-black/25 px-4 py-2 text-lg font-bold">
          {auction.topic ? `Thème : ${auction.topic}` : 'Le type de question est sur l’écran'}
        </p>
      )}
      <p className="font-semibold opacity-90">
        Mise des points en secret : gagnés si tu réponds juste, perdus sinon&nbsp;!
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Moins"
          onClick={() => setAmount((a) => clampBid(a - AUCTION_STEP, max))}
          className="size-14 rounded-full bg-white text-3xl font-black text-brand shadow active:scale-95"
        >
          −
        </button>
        <motion.span
          key={amount}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          data-testid="bid-amount"
          className="min-w-32 text-6xl font-black tabular-nums"
        >
          {amount}
        </motion.span>
        <button
          type="button"
          aria-label="Plus"
          onClick={() => setAmount((a) => clampBid(a + AUCTION_STEP, max))}
          className="size-14 rounded-full bg-white text-3xl font-black text-brand shadow active:scale-95"
        >
          +
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {quickBids(max).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(v)}
            className={`rounded-full px-4 py-1.5 font-bold ${
              v === amount ? 'bg-white text-brand' : 'bg-black/25'
            }`}
          >
            {v === max ? `Tapis ${v}` : v}
          </button>
        ))}
      </div>
      <p className="text-sm opacity-80">Mise maximale : {max} pts</p>
      <button
        type="button"
        disabled={sending || !bid}
        onClick={() => void place(amount)}
        className="rounded-xl bg-white px-10 py-3 text-2xl font-black text-brand shadow-lg active:scale-95 disabled:opacity-50"
      >
        {amount === 0 ? 'Ne rien miser' : `Miser ${amount}`}
      </button>
      {error ? (
        <p className="font-bold text-answer-yellow">{error}</p>
      ) : (
        <p data-testid="bid-sent" className="text-lg font-bold">
          {sent > 0 ? `✅ Mise enregistrée : ${sent} pts` : 'Pas encore de mise'}
        </p>
      )}
    </div>
  );
}

/** Result screen: what the bid did (« 💰 Mise gagnée : + 400 ! »). */
export function AuctionResultLine({ auction }: { auction: { bid: number; delta: number } }) {
  const line = auctionResultLine(auction);
  if (!line) return null;
  return (
    <p
      data-testid="auction-result"
      className={`rounded-lg px-4 py-1.5 font-black ${
        auction.delta > 0 ? 'bg-answer-green' : auction.delta < 0 ? 'bg-answer-red' : 'bg-black/25'
      }`}
    >
      {line}
    </p>
  );
}
