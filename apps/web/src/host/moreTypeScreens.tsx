import { motion } from 'framer-motion';
import type { QuestionRevealPayload, QuestionShowPayload, QuestionType } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { PinMarker, PinPicture, PinZoneMark } from '../components/PinPicture';
import { itemLetter, orderCells } from '../lib/orderItems';
import { cloudLayout } from '../lib/wordCloud';

/** Shared screen of the ORDER / PIN / WHO_OF_US / WORD_CLOUD questions (see `QuestionScreen`). */

export const MORE_TYPES: readonly QuestionType[] = ['ORDER', 'PIN', 'WHO_OF_US', 'WORD_CLOUD'];

const hintClass = 'rounded-2xl bg-panel px-8 py-4 text-center text-4xl font-black';

/** While answering: what to do on the phone (+ the items to order / the players to vote for). */
export function MoreTypeHint({
  question,
  instant,
}: {
  question: QuestionShowPayload;
  instant: boolean;
}) {
  const hint =
    question.type === 'ORDER'
      ? question.buzzer
        ? '🔔 Buzzez, puis donnez l’ordre à voix haute (A, B, C…)'
        : '📱 Remets dans l’ordre sur ton téléphone'
      : question.type === 'PIN'
        ? '📍 Touche l’image sur ton téléphone'
        : question.type === 'WHO_OF_US'
          ? '🗳️ Vote sur ton téléphone'
          : question.type === 'WORD_CLOUD'
            ? '☁️ Écris un mot sur ton téléphone'
            : null;
  if (!hint) return null;
  return (
    <>
      {question.type === 'ORDER' && question.items && (
        <ul className="grid w-full max-w-5xl grid-cols-2 gap-3">
          {question.items.map((item, i) => (
            <motion.li
              key={i}
              initial={instant ? false : { y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: instant ? 0 : 0.1 + i * 0.12 }}
              className="flex items-center gap-4 rounded-xl bg-white px-5 py-3 text-3xl font-bold text-brand shadow-lg"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand font-black text-white">
                {itemLetter(i)}
              </span>
              {item}
            </motion.li>
          ))}
        </ul>
      )}
      {question.type === 'WHO_OF_US' && question.candidates && (
        <div className="flex max-w-5xl flex-wrap justify-center gap-4">
          {question.candidates.map((c, i) => (
            <motion.div
              key={c.id}
              initial={instant ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: instant ? 0 : i * 0.08, type: 'spring', stiffness: 300 }}
              className="flex w-28 flex-col items-center gap-1"
            >
              <Avatar id={c.avatar} size="lg" />
              <span className="max-w-full truncate text-xl font-bold">{c.nickname}</span>
            </motion.div>
          ))}
        </div>
      )}
      <motion.p
        initial={instant ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={hintClass}
      >
        {hint}
      </motion.p>
    </>
  );
}

/** The reveal of these types. */
export function MoreTypeReveal({
  reveal,
  instant,
  questionIndex,
}: {
  reveal: QuestionRevealPayload;
  instant: boolean;
  questionIndex: number;
}) {
  if (reveal.order) return <OrderReveal order={reveal.order} instant={instant} />;
  if (reveal.pin) return <PinReveal pin={reveal.pin} instant={instant} />;
  if (reveal.votes) return <VotesReveal reveal={reveal} instant={instant} index={questionIndex} />;
  if (reveal.words) return <WordCloudReveal words={reveal.words} instant={instant} />;
  return null;
}

/**
 * The right order, item by item, with how many players placed each one right — then (T50) every
 * player's list beside it: the items as their numbers in the right order, green when in place.
 */
function OrderReveal({
  order,
  instant,
}: {
  order: NonNullable<QuestionRevealPayload['order']>;
  instant: boolean;
}) {
  const answers = order.answers ?? [];
  const compact = answers.length > 0;
  const rowsAt = instant ? 0 : 0.4 + order.items.length * 0.35;
  return (
    <div className="flex w-full max-w-7xl items-start justify-center gap-8">
      <ol className={`flex flex-col gap-3 ${compact ? 'w-[40%] shrink-0' : 'w-full max-w-4xl'}`}>
        {order.items.map((item, i) => (
          <motion.li
            key={i}
            initial={instant ? false : { x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: instant ? 0 : 0.2 + i * 0.35, type: 'spring', stiffness: 220 }}
            className={`flex items-center gap-4 rounded-xl bg-answer-green font-bold shadow-lg ${
              compact ? 'px-4 py-2 text-2xl' : 'gap-5 px-6 py-3 text-3xl'
            }`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white font-black text-answer-green">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{item}</span>
            <span className="text-xl tabular-nums opacity-90" title="Joueurs qui l’ont bien placé">
              ✓ {order.placed[i] ?? 0}
            </span>
          </motion.li>
        ))}
      </ol>
      {compact && (
        <ul
          data-testid="order-answers"
          className={`grid min-w-0 flex-1 gap-2 ${answers.length > 8 ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {answers.map((a, i) => (
            <motion.li
              key={`${a.nickname}-${i}`}
              initial={instant ? false : { y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: rowsAt + i * 0.15 }}
              className="flex items-center gap-2 rounded-xl bg-panel px-3 py-1.5"
            >
              <Avatar id={a.avatar} size="xs" />
              <span className="w-24 shrink-0 truncate text-lg font-bold">{a.nickname}</span>
              {a.order.length === 0 ? (
                <span className="flex-1 text-base italic opacity-70">pas de réponse</span>
              ) : (
                <span className="flex flex-1 gap-1">
                  {orderCells(a.order).map((c, p) => (
                    <span
                      key={p}
                      className={`flex size-8 items-center justify-center rounded-md text-lg font-black ${
                        c.right ? 'bg-answer-green' : 'bg-answer-red'
                      }`}
                    >
                      {c.rank}
                    </span>
                  ))}
                </span>
              )}
              <span className="text-base font-bold tabular-nums opacity-90">
                {a.placed} / {order.items.length}
              </span>
              <span className="w-16 text-right text-base font-black tabular-nums">+{a.points}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
/** The picture with the correct zone and every player's pin (avatar). */
function PinReveal({
  pin,
  instant,
}: {
  pin: NonNullable<QuestionRevealPayload['pin']>;
  instant: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col items-center gap-3">
      <PinPicture
        src={pin.imageUrl}
        className="overflow-hidden rounded-xl shadow-lg"
        imgClassName="h-[50vh] w-auto max-w-none"
      >
        <motion.span
          initial={instant ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: instant ? 0 : 0.3 }}
        >
          <PinZoneMark zone={pin.zone} />
        </motion.span>
        {pin.pins.map((p, i) => (
          <PinMarker key={i} point={p}>
            <motion.span
              initial={instant ? false : { scale: 0, y: -40 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ delay: instant ? 0 : 0.6 + i * 0.12, type: 'spring', stiffness: 300 }}
              className={`block rounded-full ring-4 ${p.correct ? 'ring-answer-green' : 'ring-white'}`}
              title={p.nickname}
            >
              <Avatar id={p.avatar} size="sm" />
            </motion.span>
          </PinMarker>
        ))}
      </PinPicture>
      <p className="text-2xl font-bold">
        {pin.pins.filter((p) => p.correct).length} / {pin.pins.length} dans la zone
      </p>
    </div>
  );
}

/** Funny title of the most voted player, picked by question so a reload shows the same one. */
const TITLES = [
  'Le choix du public',
  'Médaille d’or',
  'Légende vivante',
  'Star incontestée',
  'Mention spéciale du jury',
];

/** « Qui de nous ? »: the most voted player(s) with a title, then the other votes. */
function VotesReveal({
  reveal,
  instant,
  index,
}: {
  reveal: QuestionRevealPayload;
  instant: boolean;
  index: number;
}) {
  const votes = reveal.votes ?? [];
  if (votes.length === 0) {
    return <p className="text-3xl font-bold opacity-80">Personne n’a voté !</p>;
  }
  const top = votes[0]!.count;
  const winners = votes.filter((v) => v.count === top);
  const others = votes.filter((v) => v.count < top);
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-6">
      <motion.p
        initial={instant ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-full bg-answer-yellow px-8 py-2 text-3xl font-black text-black shadow-lg"
      >
        🏆 {TITLES[index % TITLES.length]}
      </motion.p>
      <div className="flex flex-wrap justify-center gap-10">
        {winners.map((w, i) => (
          <motion.div
            key={w.nickname}
            initial={instant ? false : { scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: instant ? 0 : 0.4 + i * 0.2, type: 'spring', stiffness: 220 }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-6xl" aria-hidden="true">
              👑
            </span>
            <Avatar id={w.avatar} size="xl" />
            <span className="text-4xl font-black">{w.nickname}</span>
            <span className="text-2xl font-bold opacity-90">
              {w.count} vote{w.count > 1 ? 's' : ''}
            </span>
          </motion.div>
        ))}
      </div>
      {others.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-3">
          {others.map((v, i) => (
            <motion.li
              key={v.nickname}
              initial={instant ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: instant ? 0 : 0.9 + i * 0.08 }}
              className="flex items-center gap-2 rounded-full bg-panel py-1 pr-4 pl-1 text-xl font-bold"
            >
              <Avatar id={v.avatar} size="sm" />
              {v.nickname} · {v.count}
            </motion.li>
          ))}
        </ul>
      )}
      {reveal.majorityBonus && (
        <p className="text-xl font-semibold opacity-90">
          Ceux qui ont voté comme la majorité gagnent des points bonus !
        </p>
      )}
    </div>
  );
}

const CLOUD_COLORS = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'];

/** Nuage de mots: bigger words for the most typed, popping in one by one. */
function WordCloudReveal({
  words,
  instant,
}: {
  words: NonNullable<QuestionRevealPayload['words']>;
  instant: boolean;
}) {
  if (words.length === 0) return <p className="text-3xl font-bold opacity-80">Aucune réponse</p>;
  return (
    <div
      className="flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-3"
      data-testid="word-cloud"
    >
      {cloudLayout(words).map((w, i) => (
        <motion.span
          key={w.text}
          initial={instant ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, rotate: w.rotate }}
          transition={{ delay: instant ? 0 : w.delay, type: 'spring', stiffness: 260, damping: 14 }}
          className={`rounded-xl px-3 py-1 font-black shadow ${CLOUD_COLORS[i % CLOUD_COLORS.length]}`}
          style={{ fontSize: `${w.sizeRem}rem` }}
          title={`${w.count}`}
        >
          {w.text}
        </motion.span>
      ))}
    </div>
  );
}
