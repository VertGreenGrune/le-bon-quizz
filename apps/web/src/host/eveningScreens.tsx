import { motion } from 'framer-motion';
import type { EveningStanding } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { competitionRanks } from '../lib/ranks';

/**
 * « 🌙 Classement de la soirée » (T66): the scores of the quizzes chained in the room, added up.
 * Shown in the lobby of the 2nd quiz on, and at the podium on demand (TV button or remote).
 */

const MEDALS = ['🥇', '🥈', '🥉'];

/** How many quizzes the evening counts so far (the most any player took part in). */
export function eveningQuizzes(evening: EveningStanding[]): number {
  return Math.max(0, ...evening.map((e) => e.quizzes));
}

/** « après 2 quiz » */
export function eveningSubtitle(evening: EveningStanding[]): string {
  const n = eveningQuizzes(evening);
  return n > 0 ? `après ${n} quiz` : '';
}

/** Lobby of a chained quiz: a compact panel beside the join code. */
export function EveningPanel({ evening }: { evening: EveningStanding[] }) {
  const ranks = competitionRanks(evening.map((e) => e.score));
  return (
    <section
      className="flex w-full max-w-4xl flex-col gap-2 rounded-2xl bg-panel px-6 py-4"
      data-testid="evening-panel"
    >
      <h2 className="text-center text-2xl font-black">
        🌙 Classement de la soirée{' '}
        <span className="font-semibold opacity-70">· {eveningSubtitle(evening)}</span>
      </h2>
      <ol className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xl font-bold">
        {evening.map((e, i) => (
          <li key={e.nickname} className="flex items-center gap-2">
            <span className="w-8 text-right tabular-nums opacity-70">
              {MEDALS[ranks[i]! - 1] ?? `${ranks[i]}.`}
            </span>
            <Avatar id={e.avatar} size="sm" />
            <span className="max-w-40 truncate">{e.nickname}</span>
            <span className="tabular-nums opacity-80">{e.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Full screen, from the podium: everyone, best first. */
export function EveningScreen({
  evening,
  instant,
}: {
  evening: EveningStanding[];
  instant: boolean;
}) {
  const ranks = competitionRanks(evening.map((e) => e.score));
  const compact = evening.length > 8;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-4 p-6" data-testid="evening">
      <h2 className="theme-lobby-title font-display text-6xl font-black">
        🌙 Classement de la soirée
      </h2>
      <p className="text-2xl font-semibold opacity-80">{eveningSubtitle(evening)}</p>
      <ol
        className={`grid w-full max-w-6xl gap-3 ${compact ? 'grid-flow-col grid-rows-8' : 'max-w-3xl'}`}
      >
        {evening.map((e, i) => (
          <motion.li
            key={e.nickname}
            initial={instant ? false : { x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            // Last first, the winner at the end.
            transition={{ delay: instant ? 0 : (evening.length - 1 - i) * 0.25 }}
            className={`flex items-center gap-4 rounded-2xl px-5 font-bold ${
              compact ? 'py-1 text-2xl' : 'py-2 text-3xl'
            } ${ranks[i] === 1 ? 'bg-amber-300 text-brand' : 'bg-panel'}`}
          >
            <span className="w-12 text-center tabular-nums">
              {MEDALS[ranks[i]! - 1] ?? `${ranks[i]}.`}
            </span>
            <Avatar id={e.avatar} size={compact ? 'sm' : 'md'} />
            <span className="min-w-0 flex-1 truncate">{e.nickname}</span>
            <span className="text-lg font-semibold opacity-70">{e.quizzes} quiz</span>
            <span className="w-32 text-right tabular-nums">{e.score} pts</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
