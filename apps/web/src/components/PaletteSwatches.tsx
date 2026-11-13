import { colorLabel, type OfferedColor } from '@lbq/shared';
import { textOn } from '../lib/colors';

/** « Couleurs perdues » (T65): the colors offered to the players, as swatches (TV, report). */
export function PaletteSwatches({
  palette,
  size = 'sm',
}: {
  palette: readonly OfferedColor[];
  size?: 'sm' | 'tv';
}) {
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {palette.map((c) => (
        <li
          key={c.hex}
          title={c.name ?? colorLabel(c.hex)}
          className={`flex items-center justify-center rounded-full border-2 border-white font-black shadow-md ${size === 'tv' ? 'h-12 min-w-12 px-3 text-lg' : 'size-7 text-[0.6rem]'}`}
          style={{ backgroundColor: c.hex, color: textOn(c.hex) }}
          data-testid="offered-color"
          data-hex={c.hex}
        >
          {size === 'tv' && c.name ? c.name : ''}
        </li>
      ))}
    </ul>
  );
}
