import { motion } from 'framer-motion';
import {
  matchLeftLabel,
  matchRightLabel,
  type MatchColumns,
  type MatchReveal,
  type MatchSide,
  type QuestionShowPayload,
} from '@lbq/shared';
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

/**
 * One player's answer in the board's labels, left items in the shown order: « 1 B », « 2 — »…
 * `links` = their links in pair indexes (from the reveal).
 */
export function answerChips(
  columns: MatchColumns,
  pairs: MatchReveal['pairs'],
  links: readonly number[],
): { left: string; right: string; ok: boolean }[] {
  const { pairOf } = rightLinks(columns, pairs);
  const rightShown = pairs.map((p) => columns.right.findIndex((r) => same(r, p.right)));
  return pairOf.map((p, i) => {
    const q = p >= 0 ? (links[p] ?? -1) : -1;
    return {
      left: matchLeftLabel(i),
      right: q >= 0 && rightShown[q]! >= 0 ? matchRightLabel(rightShown[q]!) : '—',
      ok: q >= 0 && q === p,
    };
  });
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
  const compact = reveal.answers.length > 6;
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
            className={`flex flex-col gap-1 rounded-xl bg-panel px-3 font-bold ${compact ? 'py-1 text-lg' : 'py-1.5 text-xl'}`}
            data-testid="match-answer"
          >
            <span className="flex items-center gap-3">
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
            </span>
            {a.links.length > 0 && (
              // What they plugged, in the board's labels: green = right, red = wrong.
              <span className="flex flex-wrap gap-1 pl-10">
                {answerChips(columns, reveal.pairs, a.links).map((c) => (
                  <span
                    key={c.left}
                    className={`rounded-md px-1.5 tabular-nums ${compact ? 'text-sm' : 'text-base'} ${
                      c.ok ? 'bg-answer-green' : 'bg-answer-red'
                    }`}
                  >
                    {c.left} {c.right}
                  </span>
                ))}
              </span>
            )}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
