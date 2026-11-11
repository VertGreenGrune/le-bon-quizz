import { motion } from 'framer-motion';
import type { ListReveal, ListStatus, QuestionShowPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/**
 * « Liste chrono » (T57) on the TV. While answering: one numbered box per item, lit as soon as
 * a player found it (never its text — everyone sees the TV) with how many found it, and each
 * player's count. At the reveal: every item with the avatars of its finders.
 */
export function ListStage({
  question,
  status,
  reveal,
  instant,
}: {
  question: QuestionShowPayload;
  status: ListStatus | null;
  reveal: ListReveal | undefined;
  instant: boolean;
}) {
  const total = question.list?.total ?? reveal?.items.length ?? 0;
  const players = reveal?.players ?? status?.players ?? [];
  const cols = total > 12 ? 'grid-cols-5' : total > 6 ? 'grid-cols-4' : 'grid-cols-3';
  return (
    <div className="flex w-full min-h-0 flex-1 gap-6">
      <ol className={`grid min-h-0 flex-1 content-center gap-3 ${cols}`} data-testid="list-items">
        {Array.from({ length: total }, (_, i) => {
          const item = reveal?.items[i];
          const finders = item ? item.finders.length : (status?.items[i] ?? 0);
          const lit = finders > 0;
          return (
            <motion.li
              key={i}
              initial={instant ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: instant ? 0 : reveal ? i * 0.12 : i * 0.03 }}
              className={`flex min-h-16 flex-col justify-center rounded-2xl px-3 py-2 text-center ${
                item
                  ? lit
                    ? 'bg-answer-green'
                    : 'bg-black/40 ring-2 ring-answer-red'
                  : lit
                    ? 'bg-answer-green/80'
                    : 'bg-panel'
              }`}
            >
              {item ? (
                <>
                  <span className="text-2xl leading-tight font-black">{item.text}</span>
                  <span className="mt-1 flex flex-wrap justify-center gap-1">
                    {item.finders.length === 0 ? (
                      <span className="text-sm font-bold opacity-80">Personne !</span>
                    ) : (
                      item.finders.map((p) => <Avatar key={p.id} id={p.avatar} size="xs" />)
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-black opacity-80">{lit ? '✓' : i + 1}</span>
                  {lit && (
                    <span className="text-sm font-bold">
                      {finders} joueur{finders > 1 ? 's' : ''}
                    </span>
                  )}
                </>
              )}
            </motion.li>
          );
        })}
      </ol>
      <ul
        className="flex w-64 shrink-0 flex-col justify-center gap-2 overflow-hidden"
        data-testid="list-players"
      >
        {players.map((p) => (
          <motion.li
            key={p.id}
            layout={!instant}
            className="flex items-center gap-2 rounded-xl bg-panel px-3 py-1.5"
          >
            <Avatar id={p.avatar} size="sm" />
            <span className="min-w-0 flex-1 truncate text-xl font-bold">{p.nickname}</span>
            <span className="text-2xl font-black tabular-nums">
              {p.found}
              <span className="text-base opacity-70">/{total}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
