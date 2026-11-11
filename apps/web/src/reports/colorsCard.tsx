import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { ColorBoardView } from '../components/ColorBoard';
import { zoneShare } from '../lib/colors';

/** « Couleurs perdues » (T58) in the report: the board, per zone who found it, every board. */
export function ColorsDetails({ q }: { q: GameQuestionReport }) {
  const colors = q.details.colors;
  if (!colors) return null;
  const total = colors.colors.length;
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="w-full max-w-64 shrink-0">
        <ColorBoardView
          board={colors.board}
          colors={colors.colors}
          colored
          labels={colors.colors.map((_, i) => zoneShare(colors, i))}
        />
      </div>
      <ul className="grid flex-1 content-start gap-2 sm:grid-cols-2">
        {colors.answers.map((a, i) => (
          <li
            key={`${a.nickname}-${i}`}
            className="flex items-center gap-2 rounded-lg bg-gray-50 p-2"
          >
            <Avatar id={a.avatar} size="xs" />
            <span className="min-w-0 flex-1 truncate font-bold">{a.nickname}</span>
            {a.colors ? (
              <>
                <span className="w-24">
                  <ColorBoardView
                    board={colors.board}
                    colors={a.colors}
                    numbers={false}
                    marks={a.colors.map((c, z) => c === colors.colors[z])}
                  />
                </span>
                <span className="font-black tabular-nums">
                  {a.right}/{total}
                </span>
              </>
            ) : (
              <span className="text-sm text-gray-500">pas de réponse</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
