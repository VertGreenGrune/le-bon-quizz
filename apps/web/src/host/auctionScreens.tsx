import { motion } from 'framer-motion';
import type { AuctionBid, AuctionStatus, LobbyMember } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { questionTypeLabel } from './questionType';
import { auctionDeltaLabel } from '../lib/auction';

/**
 * « Enchères » (T64), the bid stage of QUESTION_INTRO: the topic (or the question type) — never
 * the question —, the countdown and who has bid (never the amounts).
 */
export function AuctionBidScreen({
  index,
  total,
  auction,
  players,
  remainingMs,
}: {
  index: number;
  total: number;
  auction: AuctionStatus;
  players: LobbyMember[];
  remainingMs: number | null;
}) {
  const bidders = new Set(auction.bidders.map((b) => b.id));
  return (
    <div
      data-testid="auction-bids"
      className="flex flex-1 flex-col items-center justify-center gap-8 p-8"
    >
      <p className="rounded-full bg-panel px-6 py-2 font-display text-2xl font-bold">
        Question {index + 1} / {total}
      </p>
      <motion.h2
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.1, 1], opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="font-display text-7xl font-black drop-shadow-lg"
      >
        💰 Enchères&nbsp;!
      </motion.h2>
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-12 py-6 text-center text-black shadow-xl">
        <span className="text-xl font-semibold text-gray-500">
          {auction.topic ? 'Thème' : 'Type de question'}
        </span>
        <span data-testid="auction-topic" className="max-w-4xl text-5xl font-black">
          {auction.topic ?? questionTypeLabel({ type: auction.questionType })}
        </span>
      </div>
      <p className="max-w-4xl text-center text-2xl font-semibold opacity-90">
        Misez des points sur vos téléphones : gagnés si vous répondez juste, perdus sinon&nbsp;!
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        {players.map((p) => {
          const done = bidders.has(p.id);
          return (
            <motion.div
              key={p.id}
              data-testid="auction-player"
              data-bid={done ? 'yes' : 'no'}
              animate={{ scale: done ? [1, 1.15, 1] : 1, opacity: done ? 1 : 0.55 }}
              className="flex flex-col items-center gap-1"
            >
              <Avatar id={p.avatar} size="md" />
              <span className="max-w-32 truncate text-lg font-bold">{p.nickname}</span>
              <span className="text-lg">{done ? '💰 a misé' : '…'}</span>
            </motion.div>
          );
        })}
      </div>
      {remainingMs != null && (
        <span
          data-testid="auction-countdown"
          className="flex size-20 items-center justify-center rounded-full bg-white text-4xl font-black text-brand tabular-nums"
        >
          {Math.max(0, Math.ceil(remainingMs / 1000))}
        </span>
      )}
    </div>
  );
}

/**
 * « Enchères » at the reveal: the bids revealed one by one, biggest first (« 💰 Alice avait misé
 * 400 : + 400 ! »). A compact strip above the footer, so the footer stays on screen.
 */
export function AuctionRevealStrip({ bids, instant }: { bids: AuctionBid[]; instant: boolean }) {
  return (
    <div
      data-testid="auction-reveal"
      className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-6 pt-2"
    >
      <span className="font-display text-2xl font-black">💰 Enchères</span>
      {bids.length === 0 && <span className="text-xl opacity-80">Personne n’a misé.</span>}
      {bids.map((b, i) => (
        <motion.span
          key={b.id}
          data-testid="auction-bid"
          initial={instant ? false : { opacity: 0, y: 16, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: instant ? 0 : 1.2 + i * 0.7 }}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xl font-bold shadow ${
            b.delta > 0 ? 'bg-answer-green' : b.delta < 0 ? 'bg-answer-red' : 'bg-panel'
          }`}
        >
          <Avatar id={b.avatar} size="xs" />
          {b.nickname} avait misé {b.amount} : {auctionDeltaLabel(b.delta)}
        </motion.span>
      ))}
    </div>
  );
}
