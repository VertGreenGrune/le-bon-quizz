import { motion } from 'framer-motion';
import type { LobbyMember, PointlessReveal } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { AcceptButton, AcceptedTag } from './acceptControls';
import type { AcceptInput } from './accept';

/**
 * « Pas évident ! » (T60) reveal on the TV: the right answers given, rarest first (« 💎 » for
 * one nobody else gave), with who gave them and the points each; then the wrong ones (struck,
 * « ✅ Accepter » for the host, T44); then a few right answers nobody thought of.
 */
export function PointlessRevealView({
  reveal,
  instant,
  onAccept,
}: {
  reveal: PointlessReveal;
  instant: boolean;
  onAccept?: (input: AcceptInput) => void;
}) {
  const delay = (i: number) => (instant ? 0 : 0.3 + i * 0.35);
  const rightCount = reveal.answers.length;
  // Up to 15 players: smaller rows when there are many groups, so everything fits on the TV.
  const compact = Math.max(rightCount, reveal.wrong.length) > 6;
  const row = compact ? 'py-1 text-2xl' : 'py-2 text-3xl';
  return (
    <div className="flex w-full max-w-6xl min-h-0 flex-col gap-4" data-testid="pointless">
      <div className="flex min-h-0 gap-5">
        <section className="flex min-w-0 flex-[3] flex-col gap-2">
          <h3 className="text-2xl font-black">✓ Bonnes réponses, de la plus rare…</h3>
          {rightCount === 0 ? (
            <p className="rounded-xl bg-panel px-5 py-3 text-2xl font-bold opacity-80">
              Personne n’a trouvé de bonne réponse !
            </p>
          ) : (
            <ul className="flex min-h-0 flex-col gap-2 overflow-hidden">
              {reveal.answers.map((a, i) => {
                const unique = a.players.length === 1;
                return (
                  <motion.li
                    key={a.text}
                    initial={instant ? false : { x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: delay(i) }}
                    className={`flex items-center gap-3 rounded-xl px-4 shadow ${row} ${
                      unique ? 'bg-answer-green ring-4 ring-white' : 'bg-answer-green/75'
                    }`}
                    data-testid="pointless-right"
                  >
                    <span className="min-w-0 flex-1 truncate font-black">
                      {unique && '💎 '}
                      {a.text}
                    </span>
                    {a.accepted && <AcceptedTag />}
                    <Players players={a.players} />
                    <span className="w-28 shrink-0 text-right text-2xl font-black tabular-nums">
                      +{a.points}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>
        {reveal.wrong.length > 0 && (
          <section className="flex min-w-0 flex-[2] flex-col gap-2">
            <h3 className="text-2xl font-black">✗ Raté</h3>
            <ul className="flex min-h-0 flex-col gap-2 overflow-hidden">
              {reveal.wrong.map((w, i) => (
                <motion.li
                  key={w.text}
                  initial={instant ? false : { x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: delay(rightCount + i) }}
                  className={`flex items-center gap-3 rounded-xl bg-panel px-4 ${compact ? 'py-1' : 'py-2'}`}
                  data-testid="pointless-wrong"
                >
                  <span className="min-w-0 flex-1 truncate text-2xl font-bold line-through decoration-answer-red decoration-4 opacity-90">
                    {w.text}
                  </span>
                  <Players players={w.players} />
                  {onAccept && <AcceptButton onClick={() => onAccept({ text: w.text })} />}
                </motion.li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {reveal.missed.length > 0 && (
        <motion.p
          initial={instant ? false : { y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: delay(rightCount + reveal.wrong.length) }}
          className="rounded-2xl bg-panel px-6 py-3 text-center text-2xl font-bold"
          data-testid="pointless-missed"
        >
          🤔 Personne n’a pensé à : {reveal.missed.join(' · ')}
          {reveal.missedCount > reveal.missed.length &&
            ` … (+ ${reveal.missedCount - reveal.missed.length})`}
        </motion.p>
      )}
    </div>
  );
}

function Players({ players }: { players: LobbyMember[] }) {
  return (
    <span className="flex max-w-[45%] shrink-0 items-center gap-1 overflow-hidden">
      {players.map((p) => (
        <span key={p.id} className="flex items-center gap-1" title={p.nickname}>
          <Avatar id={p.avatar} size="sm" />
          {players.length <= 2 && (
            <span className="max-w-32 truncate text-lg font-bold">{p.nickname}</span>
          )}
        </span>
      ))}
    </span>
  );
}
