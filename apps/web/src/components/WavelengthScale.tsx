import { motion } from 'framer-motion';
import type { AvatarId, WavelengthSpectrum } from '@lbq/shared';
import { Avatar } from './Avatar';
import { bandsFor, needleLanes } from '../lib/wavelength';

export interface ScaleNeedle {
  id: string;
  nickname: string;
  avatar: AvatarId;
  value: number;
  /** « 🎯 Pile dessus ! »: one of the closest needles. */
  best?: boolean;
}

const BAND_CLASS: Record<number, string> = {
  0.3: 'bg-amber-200',
  0.6: 'bg-orange-400',
  1: 'bg-lime-300',
};

const SIZES = {
  tv: { bar: 'h-14', words: 'text-3xl', avatar: 'md', lane: 58, gap: 6, label: 'text-base' },
  phone: { bar: 'h-10', words: 'text-lg', avatar: 'sm', lane: 44, gap: 9, label: 'text-xs' },
  small: { bar: 'h-6', words: 'text-sm', avatar: 'xs', lane: 30, gap: 7, label: 'text-[10px]' },
} as const;

/**
 * « Sur la même longueur d'onde » (T62): the scale between two words. With `target`, the scoring
 * bands (± 20 / 12 / 5) and the target line; `needles` = avatars above the bar (overlapping ones
 * on separate lanes); `value` = one plain needle (the phone's own guess).
 */
export function WavelengthScale({
  spectrum,
  target,
  needles = [],
  value,
  size = 'tv',
  instant = true,
  hideTarget = false,
}: {
  spectrum: WavelengthSpectrum;
  target?: number;
  needles?: ScaleNeedle[];
  value?: number;
  size?: keyof typeof SIZES;
  instant?: boolean;
  /** Bands without the target's number (the psychic's own dial: the zone is enough). */
  hideTarget?: boolean;
}) {
  const z = SIZES[size];
  const lanes = needleLanes(
    needles.map((n) => n.value),
    z.gap,
  );
  const laneCount = needles.length ? Math.max(...lanes) + 1 : 0;
  return (
    <div className="flex w-full flex-col gap-1" data-testid="wavelength-scale">
      {laneCount > 0 && (
        <div className="relative w-full" style={{ height: laneCount * z.lane }}>
          {needles.map((n, i) => (
            <motion.div
              key={n.id}
              initial={instant ? false : { y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: instant ? 0 : 0.6 + i * 0.12 }}
              className="absolute flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${n.value}%`, bottom: lanes[i]! * z.lane }}
              title={`${n.nickname} : ${n.value}`}
              data-testid="wavelength-needle"
            >
              <span className={n.best ? 'rounded-xl ring-4 ring-answer-green' : ''}>
                <Avatar id={n.avatar} size={z.avatar} />
              </span>
              <span className="h-2 w-0.5 bg-white" />
            </motion.div>
          ))}
        </div>
      )}
      <div
        className={`relative w-full overflow-hidden rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-rose-500 shadow-inner ${z.bar}`}
      >
        {target !== undefined &&
          bandsFor(target).map((b) => (
            <motion.div
              key={b.share}
              initial={instant ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: instant ? 0 : 0.2 }}
              className={`absolute inset-y-0 ${BAND_CLASS[b.share]}`}
              style={{ left: `${b.from}%`, width: `${b.to - b.from}%` }}
              data-testid={b.share === 1 ? 'wavelength-target' : undefined}
            />
          ))}
        {target !== undefined && (
          <div
            className="absolute inset-y-0 w-1 -translate-x-1/2 bg-brand"
            style={{ left: `${target}%` }}
          />
        )}
        {needles.map((n) => (
          <div
            key={n.id}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90"
            style={{ left: `${n.value}%` }}
          />
        ))}
        {value !== undefined && (
          <div
            className="absolute inset-y-[-4px] w-2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(0,0,0,0.5)]"
            style={{ left: `${value}%` }}
            data-testid="wavelength-own"
          />
        )}
      </div>
      {target !== undefined && !hideTarget && (
        <div className="relative h-6 w-full">
          <span
            className={`absolute -translate-x-1/2 rounded-full bg-white px-2 font-black text-brand tabular-nums ${z.label}`}
            style={{ left: `${target}%` }}
          >
            🎯 {target}
          </span>
        </div>
      )}
      <div className={`flex w-full justify-between gap-4 font-black ${z.words}`}>
        <span className="min-w-0 break-words">← {spectrum.left}</span>
        <span className="min-w-0 break-words text-right">{spectrum.right} →</span>
      </div>
    </div>
  );
}
