import { motion } from 'framer-motion';
import { useState } from 'react';
import type { MatchColumns, PlayerResultPayload } from '@lbq/shared';
import { WireBoard, type WireSide } from '../components/WireBoard';
import { sendAnswer } from './playerStore';

/**
 * « Associer » (T67) on the phone: like repairing wires, drag a cable from an item to its partner
 * on the other side (or tap one, then the other). A plugged cable pulled out and dropped in the
 * middle, or a tap on a plugged item, unplugs it. « Valider » once every item is plugged.
 */

/** `links[left]` = right linked to it (-1): links `left` to `right`, moving whatever was there. */
export function linkPair(links: readonly number[], left: number, right: number): number[] {
  return links.map((r, l) => (l === left ? right : r === right ? -1 : r));
}

export function MatchAnswer({ columns, initial }: { columns: MatchColumns; initial?: number[] }) {
  const n = columns.left.length;
  const [links, setLinks] = useState<number[]>(() =>
    initial?.length === n ? [...initial] : Array.from({ length: n }, () => -1),
  );
  const [selected, setSelected] = useState<{ side: WireSide; index: number } | null>(null);
  const linkedCount = links.filter((r) => r >= 0).length;

  const connect = (left: number, right: number) => {
    setLinks((ls) => linkPair(ls, left, right));
    setSelected(null);
  };
  const unplug = (left: number) => setLinks((ls) => ls.map((r, i) => (i === left ? -1 : r)));
  /** Tap-tap: one item, then one on the other side. Tapping a plugged item unplugs it. */
  const tap = (side: WireSide, index: number) => {
    if (selected && selected.side !== side) {
      return side === 'left' ? connect(index, selected.index) : connect(selected.index, index);
    }
    const left = side === 'left' ? index : links.indexOf(index);
    if (left >= 0 && links[left]! >= 0) unplug(left);
    setSelected(selected?.side === side && selected.index === index ? null : { side, index });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">Relie les paires</h2>
      <p className="-mt-2 text-center text-sm font-semibold opacity-80">
        Tire un câble de chaque élément jusqu’à son partenaire
      </p>
      <div className="min-h-0 overflow-y-auto px-0.5 py-1" data-testid="match-pad">
        <WireBoard
          columns={columns}
          links={links}
          selected={selected}
          onTap={tap}
          onConnect={connect}
          onUnplug={unplug}
        />
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

/** « Réponse envoyée ! »: the cables as plugged. */
export function MatchAnswered({ columns, links }: { columns: MatchColumns; links: number[] }) {
  return (
    <div className="w-full max-w-md">
      <WireBoard columns={columns} links={links} />
    </div>
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
