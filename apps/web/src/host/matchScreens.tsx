import { motion } from 'framer-motion';
import {
  matchLeftLabel,
  matchRightLabel,
  type MatchReveal,
  type QuestionShowPayload,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { MatchSideCard } from '../components/MatchSideCard';

/**
 * « Associer » (T67) on the TV: while answering, both columns (left 1, 2, 3…, right A, B, C…, the
 * same shuffle as the phones); at the reveal, the right pairs (how many found each) and every
 * player's score.
 */
export function MatchStage({
  question,
  reveal,
  instant,
}: {
  question: QuestionShowPayload;
  reveal?: MatchReveal;
  instant: boolean;
}) {
  if (reveal) return <MatchRevealView reveal={reveal} instant={instant} />;
  const columns = question.match;
  if (!columns) return null;
  return (
    <div className="flex w-full flex-col items-center gap-3" data-testid="match-columns">
      <p className="text-2xl font-bold opacity-90">🔗 Reliez chaque élément à son partenaire !</p>
      <div className="grid w-full max-w-6xl grid-cols-2 gap-x-16 gap-y-3">
        {columns.left.map((left, i) => (
          <MatchRow key={i} index={i} instant={instant}>
            <MatchSideCard side={left} label={matchLeftLabel(i)} size="lg" />
            <MatchSideCard side={columns.right[i]!} label={matchRightLabel(i)} size="lg" />
          </MatchRow>
        ))}
      </div>
    </div>
  );
}

/** Two cells of the grid (one per column), flying in one row after the other. */
function MatchRow({
  index,
  instant,
  children,
}: {
  index: number;
  instant: boolean;
  children: [React.ReactNode, React.ReactNode];
}) {
  return (
    <>
      {children.map((child, side) => (
        <motion.div
          key={side}
          initial={instant ? false : { x: side ? 60 : -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: instant ? 0 : index * 0.12 }}
          className="flex min-w-0 items-center rounded-xl bg-panel px-4 py-2"
        >
          {child}
        </motion.div>
      ))}
    </>
  );
}

function MatchRevealView({ reveal, instant }: { reveal: MatchReveal; instant: boolean }) {
  const total = reveal.pairs.length;
  return (
    <div className="flex w-full min-h-0 items-start gap-6" data-testid="match-reveal">
      <ol className="flex min-w-0 flex-[3] flex-col gap-2">
        {reveal.pairs.map((pair, p) => (
          <motion.li
            key={p}
            initial={instant ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: instant ? 0 : p * 0.2 }}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-answer-green/90 px-4 py-2"
          >
            <MatchSideCard side={pair.left} size="lg" />
            <span className="text-3xl font-black" aria-hidden="true">
              ↔
            </span>
            <MatchSideCard side={pair.right} size="lg" />
            <span className="rounded-full bg-black/25 px-3 text-xl font-black tabular-nums">
              ✓ {reveal.found[p]}
            </span>
          </motion.li>
        ))}
      </ol>
      <ol className="flex min-w-0 flex-[2] flex-col gap-1.5">
        {reveal.answers.map((a, i) => (
          <motion.li
            key={a.nickname}
            initial={instant ? false : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: instant ? 0 : 0.4 + i * 0.1 }}
            className="flex items-center gap-3 rounded-xl bg-panel px-3 py-1.5 text-xl font-bold"
          >
            <Avatar id={a.avatar} size="sm" />
            <span className="min-w-0 flex-1 truncate">{a.nickname}</span>
            {a.links.length ? (
              <>
                <span className="tabular-nums">
                  {a.right} / {total}
                </span>
                <span className="w-20 text-right tabular-nums opacity-80">+{a.points}</span>
              </>
            ) : (
              <span className="text-base opacity-70">pas de réponse</span>
            )}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
