import { motion } from 'framer-motion';
import type { PlayerResultPayload } from '@lbq/shared';

type Pointless = NonNullable<PlayerResultPayload['pointless']>;

/** « Pas évident ! » (T60) result title: « 💎 Pas évident ! » for a right answer nobody else gave. */
export function pointlessResultTitle(r: PlayerResultPayload, answered: boolean): string {
  if (r.correct) return r.pointless?.sharedBy === 1 ? '💎 Pas évident !' : 'Bien vu !';
  return answered ? 'Raté !' : 'Temps écoulé !';
}

/** « Personne d’autre n’y a pensé » / « 3 joueurs ont dit Maroc » (null when wrong / no answer). */
export function pointlessResultLine(p: Pointless): string | null {
  if (p.sharedBy <= 0 || !p.yours) return null;
  if (p.sharedBy === 1) return 'Personne d’autre n’y a pensé !';
  return `${p.sharedBy} joueurs ont dit ${p.yours} : les points sont partagés`;
}

export function PointlessResultLine({ pointless }: { pointless: Pointless }) {
  const line = pointlessResultLine(pointless);
  if (!line) return null;
  return (
    <motion.p
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl bg-black/25 px-4 py-2 text-xl font-black"
      data-testid="pointless-line"
    >
      {line}
    </motion.p>
  );
}
