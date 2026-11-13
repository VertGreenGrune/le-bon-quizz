import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  matchLeftLabel,
  matchRightLabel,
  type MatchColumns,
  type PlayerResultPayload,
} from '@lbq/shared';
import { MatchSideCard } from '../components/MatchSideCard';
import { sendAnswer } from './playerStore';

/**
 * « Associer » (T67) on the phone: tap an item on the left, then its partner on the right (or
 * the other way round). Linked items share a color and the left item's number; tapping a linked
 * item unlinks it. « Valider » once every item is linked.
 */

/** One color per left item (never the answer colors' meaning: just to see the links). */
export const LINK_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599'];

/** `links[left]` = right linked to it (-1): links `left` to `right`, moving whatever was there. */
export function linkPair(links: readonly number[], left: number, right: number): number[] {
  return links.map((r, l) => (l === left ? right : r === right ? -1 : r));
}

export function MatchAnswer({ columns, initial }: { columns: MatchColumns; initial?: number[] }) {
  const n = columns.left.length;
  const [links, setLinks] = useState<number[]>(() =>
    initial?.length === n ? [...initial] : Array.from({ length: n }, () => -1),
  );
  const [selected, setSelected] = useState<{ side: 'left' | 'right'; index: number } | null>(null);
  const linkedCount = links.filter((r) => r >= 0).length;

  const tapLeft = (l: number) => {
    if (links[l]! >= 0 && selected?.side !== 'right') {
      setLinks((ls) => ls.map((r, i) => (i === l ? -1 : r))); // unlink
      setSelected({ side: 'left', index: l });
      return;
    }
    if (selected?.side === 'right') {
      setLinks((ls) => linkPair(ls, l, selected.index));
      setSelected(null);
    } else setSelected(selected?.index === l ? null : { side: 'left', index: l });
  };
  const tapRight = (r: number) => {
    const owner = links.indexOf(r);
    if (owner >= 0 && selected?.side !== 'left') {
      setLinks((ls) => ls.map((x, i) => (i === owner ? -1 : x))); // unlink
      setSelected({ side: 'right', index: r });
      return;
    }
    if (selected?.side === 'left') {
      setLinks((ls) => linkPair(ls, selected.index, r));
      setSelected(null);
    } else
      setSelected(
        selected?.index === r && selected.side === 'right' ? null : { side: 'right', index: r },
      );
  };

  const cell = (active: boolean, color: string | undefined) =>
    `flex min-h-14 w-full touch-manipulation items-center rounded-2xl border-4 bg-white px-2 py-1.5 text-left text-brand shadow ${
      active ? 'border-brand scale-[1.03]' : color ? '' : 'border-transparent'
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">Associe les paires</h2>
      <p className="-mt-2 text-center text-sm font-semibold opacity-80">
        Touche un élément à gauche, puis son partenaire à droite
      </p>
      <div
        className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto px-0.5 py-1"
        data-testid="match-pad"
      >
        {columns.left.map((left, l) => {
          const color = links[l]! >= 0 ? LINK_COLORS[l % LINK_COLORS.length] : undefined;
          // Row `l` holds the left item `l` and the right item `l` (both columns side by side).
          const r = l;
          const owner = links.indexOf(r);
          const rightColor = owner >= 0 ? LINK_COLORS[owner % LINK_COLORS.length] : undefined;
          return [
            <button
              key={`l${l}`}
              type="button"
              onClick={() => tapLeft(l)}
              className={cell(selected?.side === 'left' && selected.index === l, color)}
              style={color ? { borderColor: color } : undefined}
              aria-pressed={selected?.side === 'left' && selected.index === l}
              data-testid={`match-left-${l}`}
            >
              <MatchSideCard side={left} label={matchLeftLabel(l)} size="sm" />
            </button>,
            <button
              key={`r${r}`}
              type="button"
              onClick={() => tapRight(r)}
              className={`relative ${cell(selected?.side === 'right' && selected.index === r, rightColor)}`}
              style={rightColor ? { borderColor: rightColor } : undefined}
              aria-pressed={selected?.side === 'right' && selected.index === r}
              data-testid={`match-right-${r}`}
            >
              <MatchSideCard side={columns.right[r]!} label={matchRightLabel(r)} size="sm" />
              {owner >= 0 && (
                <span
                  className="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full text-sm font-black text-white shadow"
                  style={{ background: rightColor }}
                  aria-label={`relié à ${matchLeftLabel(owner)}`}
                >
                  {matchLeftLabel(owner)}
                </span>
              )}
            </button>,
          ];
        })}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        disabled={linkedCount < n}
        onClick={() => sendAnswer({ matches: links })}
        className="mt-auto w-full shrink-0 touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Valider ({linkedCount}/{n})
      </motion.button>
    </div>
  );
}

/** « Réponse envoyée ! »: the links given, « 1 ↔ B ». */
export function MatchAnswered({ columns, links }: { columns: MatchColumns; links: number[] }) {
  return (
    <ol className="flex w-full max-w-sm flex-col gap-1.5">
      {links.map((r, l) => (
        <li
          key={l}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl bg-white px-2 py-1 text-brand"
        >
          <MatchSideCard side={columns.left[l]!} label={matchLeftLabel(l)} size="sm" />
          <span className="font-black">↔</span>
          {r >= 0 ? (
            <MatchSideCard side={columns.right[r]!} label={matchRightLabel(r)} size="sm" />
          ) : (
            <span className="text-sm opacity-60">—</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Result line: « 3 / 4 paires justes ». */
export function MatchResultLine({ match }: { match: NonNullable<PlayerResultPayload['match']> }) {
  return (
    <p className="font-bold">
      {match.right} / {match.total} paire{match.total > 1 ? 's' : ''} juste
      {match.right > 1 ? 's' : ''}
    </p>
  );
}
