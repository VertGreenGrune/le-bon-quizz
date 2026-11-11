import { motion } from 'framer-motion';
import type { ColorsReveal, QuestionShowPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { ColorBoardView } from '../components/ColorBoard';
import { zoneShare } from '../lib/colors';

/**
 * « Couleurs perdues » (T58) on the TV: the colored board while memorizing, the grey numbered
 * board while the phones answer, then the colors again with each player's board.
 */
export function ColorsStage({
  question,
  reveal,
  instant,
}: {
  question: QuestionShowPayload;
  reveal: ColorsReveal | undefined;
  instant: boolean;
}) {
  const colors = question.colors;
  if (reveal) return <ColorsRevealView reveal={reveal} instant={instant} />;
  if (!colors) return null;
  const memo = colors.stage === 'memo';
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3">
      <motion.p
        key={colors.stage}
        initial={instant ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-full bg-panel px-8 py-2 text-3xl font-black"
        data-testid="colors-stage"
      >
        {memo
          ? '👀 Mémorisez les couleurs !'
          : '🎨 À vous ! Remettez les couleurs sur vos téléphones'}
      </motion.p>
      <motion.div
        key={`board-${colors.stage}`}
        initial={instant ? false : { opacity: 0, scale: memo ? 0.9 : 1 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: memo ? 0.4 : 0.8 }}
        className="flex min-h-0 w-full flex-1"
      >
        <ColorBoardView
          board={colors.board}
          colors={colors.colors}
          colored={memo}
          numbers={!memo || !!colors.board.imageUrl}
          fit
          className="size-full"
        />
      </motion.div>
    </div>
  );
}

function ColorsRevealView({ reveal, instant }: { reveal: ColorsReveal; instant: boolean }) {
  const total = reveal.colors.length;
  const many = reveal.answers.length > 8;
  return (
    <div className="flex min-h-0 w-full flex-1 gap-6" data-testid="colors-reveal">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <ColorBoardView
          board={reveal.board}
          colors={reveal.colors}
          colored
          labels={reveal.colors.map((_, i) => zoneShare(reveal, i))}
          fit
          className="min-h-0 flex-1"
        />
        <p className="text-center text-lg font-semibold opacity-80">
          Sous chaque numéro : les joueurs qui ont trouvé sa couleur
        </p>
      </div>
      <ul
        className={`grid min-h-0 shrink-0 content-center gap-2 overflow-hidden ${many ? 'w-[46%] grid-cols-3' : 'w-[40%] grid-cols-2'}`}
        data-testid="colors-answers"
      >
        {reveal.answers.map((a, i) => (
          <motion.li
            key={`${a.nickname}-${i}`}
            initial={instant ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: instant ? 0 : 0.3 + i * 0.12 }}
            className="flex min-w-0 flex-col gap-1 rounded-xl bg-panel p-2"
          >
            <div className="flex items-center gap-2">
              <Avatar id={a.avatar} size="xs" />
              <span className="min-w-0 flex-1 truncate font-bold">{a.nickname}</span>
              <span className="font-black tabular-nums">
                {a.colors ? `${a.right}/${total}` : '—'}
              </span>
            </div>
            {a.colors ? (
              <ColorBoardView
                board={reveal.board}
                colors={a.colors}
                numbers={false}
                marks={a.colors.map((c, z) => c === reveal.colors[z])}
              />
            ) : (
              <p className="py-2 text-center text-sm font-semibold opacity-70">pas de réponse</p>
            )}
            {a.points > 0 && (
              <span className="text-center text-sm font-black text-accent">+{a.points}</span>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
