import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { COLOR_PALETTE, type ColorBoard, type PlayerResultPayload } from '@lbq/shared';
import { ColorBoardView } from '../components/ColorBoard';
import { firstZone, initialColors, nextZone, paintZone } from '../lib/colors';
import type { PlayerState } from './playerState';
import { sendAnswer } from './playerStore';

/** Palette colors light enough for black text. */
const LIGHT = new Set([2, 6]);

/** « Couleurs perdues » (T58), stage 1: the phone has nothing of the board — look at the TV. */
export function ColorsMemo() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <motion.p
        className="text-8xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        aria-hidden="true"
      >
        👀
      </motion.p>
      <h2 className="text-3xl leading-tight font-black" data-testid="colors-memo">
        Regarde l’écran et retiens les couleurs&nbsp;!
      </h2>
      <p className="text-lg font-semibold opacity-85">
        Tout à l’heure, il faudra les remettre à leur place.
      </p>
    </div>
  );
}

/**
 * Stage 2: tap a zone of the grey board, then a color of the palette (the next empty zone is
 * selected). 50/50: some zones come already colored and locked. « Valider » sends the colors.
 */
export function ColorsPad({
  board,
  hints = [],
  initial,
}: {
  board: ColorBoard;
  hints?: readonly { zone: number; color: number }[];
  initial?: readonly number[];
}) {
  const zones = board.spots.length;
  const locked = useMemo(() => new Set(hints.map((h) => h.zone)), [hints]);
  const [colors, setColors] = useState(() => initialColors(zones, hints, initial));
  const [selected, setSelected] = useState(() => firstZone(colors, locked));
  const done = colors.filter((c) => c >= 0).length;
  const current = colors[selected];
  const pick = (color: number) => {
    if (locked.has(selected)) return;
    const next = paintZone(colors, selected, color);
    setColors(next);
    if (next[selected] !== -1) setSelected(nextZone(next, selected, locked));
    navigator.vibrate?.(15);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="text-center text-lg leading-tight font-black">
        🎨 Touche une zone, puis sa couleur
      </p>
      <ColorBoardView
        board={board}
        colors={colors}
        selected={selected}
        locked={locked}
        onSpot={setSelected}
        fit
        className="min-h-0 flex-1"
      />
      <p className="text-center font-bold" data-testid="colors-zone">
        Zone {selected + 1}
        {locked.has(selected) ? ' 🎯 déjà trouvée' : ''}
      </p>
      <div className="grid grid-cols-4 gap-2" data-testid="colors-palette">
        {COLOR_PALETTE.map((c, i) => (
          <motion.button
            key={c.name}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => pick(i)}
            aria-label={c.name}
            aria-pressed={current === i}
            disabled={locked.has(selected)}
            className={`h-12 touch-manipulation rounded-xl text-sm font-black shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)] disabled:opacity-40 ${
              current === i ? 'ring-4 ring-white ring-offset-2 ring-offset-black' : ''
            } ${LIGHT.has(i) ? 'text-black' : 'text-white'}`}
            style={{ backgroundColor: c.hex }}
          >
            {c.name}
          </motion.button>
        ))}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={done === 0}
        onClick={() => sendAnswer({ colors })}
        className="touch-manipulation rounded-2xl bg-answer-green py-3 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Valider ({done}/{zones})
      </motion.button>
    </div>
  );
}

/** « Réponse envoyée ! »: the board as colored by the player. */
export function ColorsAnswered({ board, colors }: { board: ColorBoard; colors: number[] }) {
  return (
    <div className="w-full max-w-xs">
      <ColorBoardView board={board} colors={colors} />
    </div>
  );
}

/** Result screen: « 3 / 4 bonnes couleurs » and the right board, the player's mistakes marked. */
export function ColorsResultLines({
  colors,
  board,
}: {
  colors: NonNullable<PlayerResultPayload['colors']>;
  board?: ColorBoard;
}) {
  return (
    <>
      <p className="text-xl font-black" data-testid="colors-result">
        {colors.right} / {colors.total} bonne{colors.right > 1 ? 's' : ''} couleur
        {colors.right > 1 ? 's' : ''}
      </p>
      {board && (
        <div className="w-full max-w-xs">
          <ColorBoardView
            board={board}
            colors={colors.colors}
            colored
            numbers={false}
            marks={colors.yours ? colors.colors.map((c, i) => colors.yours![i] === c) : undefined}
          />
        </div>
      )}
    </>
  );
}
