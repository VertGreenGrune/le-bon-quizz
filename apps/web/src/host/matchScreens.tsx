import { motion } from 'framer-motion';
import type { MatchColumns, MatchReveal, MatchSide, QuestionShowPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { WireBoard } from '../components/WireBoard';

/**
 * « Associer » (T67) on the TV: the wire board (left items 1, 2, 3…, right A, B, C…, the same
 * shuffle as the phones); at the reveal the right cables draw themselves one after the other, with
 * how many players found each, beside every player's score.
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
  const columns = question.match;
  if (!columns) return null;
  if (reveal) return <MatchRevealView columns={columns} reveal={reveal} instant={instant} />;
  const none = columns.left.map(() => -1);
  return (
    <div className="flex w-full flex-col items-center gap-3" data-testid="match-columns">
      <p className="text-2xl font-bold opacity-90">🔌 Reliez chaque élément à son partenaire !</p>
      <div className="w-full max-w-6xl">
        <WireBoard columns={columns} links={none} size="tv" />
      </div>
    </div>
  );
}

const same = (a: MatchSide, b: MatchSide) =>
  (a.text ?? '') === (b.text ?? '') && (a.imageUrl ?? '') === (b.imageUrl ?? '');

/** The right links in shown indexes, and the pair of each shown left item. */
export function rightLinks(
  columns: MatchColumns,
  pairs: MatchReveal['pairs'],
): { links: number[]; pairOf: number[] } {
  const pairOf = columns.left.map((l) => pairs.findIndex((p) => same(p.left, l)));
  const links = pairOf.map((p) =>
    p < 0 ? -1 : columns.right.findIndex((r) => same(r, pairs[p]!.right)),
  );
  return { links, pairOf };
}

function MatchRevealView({
  columns,
  reveal,
  instant,
}: {
  columns: MatchColumns;
  reveal: MatchReveal;
  instant: boolean;
}) {
  const total = reveal.pairs.length;
  const { links, pairOf } = rightLinks(columns, reveal.pairs);
  return (
    <div className="flex min-h-0 w-full items-start gap-6" data-testid="match-reveal">
      <div className="min-w-0 flex-[3]">
        <WireBoard
          columns={columns}
          links={links}
          size="tv"
          draw={!instant}
          badges={pairOf.map((p) => (p >= 0 ? `✓ ${reveal.found[p]}` : null))}
        />
      </div>
      <ol className="flex min-w-0 flex-[2] flex-col gap-1.5">
        {reveal.answers.map((a, i) => (
          <motion.li
            key={a.nickname}
            initial={instant ? false : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: instant ? 0 : 0.6 + total * 0.45 + i * 0.1 }}
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
