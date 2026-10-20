import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { SHAPES } from '@lbq/shared';
import { Confetti, CountUp } from '../components/motion';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { errorMessage, formatRank, playerScreen, type PlayerState } from './playerState';
import { leaveGame, resumeSession, sendAnswer, usePlayerState } from './playerStore';
import { useWakeLock } from './useWakeLock';

/** /play — phone controller. Question text is only on the shared screen. */
export function PlayPage() {
  const [session] = useState(resumeSession);
  const s = usePlayerState();
  const screen = playerScreen(s);
  useWakeLock(!!session && screen !== 'ended' && screen !== 'kicked' && screen !== 'lost');

  if (!session && screen !== 'kicked' && screen !== 'lost') return <Navigate to="/join" replace />;

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex h-dvh select-none flex-col overflow-hidden bg-brand text-white">
        <TopBar s={s} />
        <AnimatePresence mode="wait">
          <motion.section
            key={`${screen}-${s.questionIndex}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {renderScreen(screen, s)}
          </motion.section>
        </AnimatePresence>
        {!s.connected && screen !== 'kicked' && screen !== 'lost' && (
          <div className="bg-black/70 py-2 text-center text-sm font-bold">Reconnexion…</div>
        )}
      </main>
    </MotionConfig>
  );
}

function renderScreen(screen: ReturnType<typeof playerScreen>, s: PlayerState) {
  switch (screen) {
    case 'connecting':
      return <Message title="Connexion…" />;
    case 'lobby':
      return (
        <Message
          title="Tu es dans la partie !"
          subtitle="Ton pseudo apparaît sur l'écran. On attend les autres…"
        >
          <BouncingShapes />
        </Message>
      );
    case 'getReady':
      return (
        <Message
          title={`Question ${s.questionIndex + 1}`}
          subtitle="Prépare-toi… regarde l'écran !"
        >
          <motion.p
            className="text-8xl font-black"
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.25, 1] }}
            transition={{ duration: 0.6 }}
            aria-hidden="true"
          >
            {s.questionIndex + 1}
          </motion.p>
          <BouncingShapes />
        </Message>
      );
    case 'answer':
      return <AnswerButtons choiceCount={s.prompt?.choiceCount ?? 4} />;
    case 'answered':
      return <Answered choiceIndex={s.myAnswer!.choiceIndex} />;
    case 'waitingResult':
      return <Message title="Résultat…" subtitle="Regarde l'écran !" />;
    case 'result':
      return <Result s={s} />;
    case 'standings':
      return <Standings s={s} />;
    case 'podium':
      return <Podium s={s} />;
    case 'ended':
      return <End title="Partie terminée" subtitle={`Score final : ${s.totalScore} pts`} />;
    case 'kicked':
      return <End title="Tu as été exclu de la partie" />;
    case 'lost':
      return <End title="Partie introuvable" subtitle={errorMessage(s.lost!)} />;
  }
}

function TopBar({ s }: { s: PlayerState }) {
  const inQuestion = s.questionIndex >= 0 && s.phase !== 'PODIUM' && s.phase !== 'ENDED';
  return (
    <header className="flex items-center justify-between gap-2 bg-black/20 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-bold">
      <span className="truncate">{s.nickname}</span>
      <span className="flex items-center gap-3">
        {inQuestion && s.totalQuestions > 0 && (
          <span className="opacity-80">
            {s.questionIndex + 1}/{s.totalQuestions}
          </span>
        )}
        {s.phase === 'ANSWERING' && <Countdown endsAt={s.answeringEndsAt} />}
        <motion.span
          key={s.totalScore}
          initial={s.totalScore > 0 ? { scale: 1.5 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          className="rounded bg-white px-2 py-0.5 text-brand"
        >
          {s.totalScore}
        </motion.span>
      </span>
    </header>
  );
}

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (endsAt === null) return null;
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <motion.span
      key={sec}
      initial={{ scale: sec <= 5 ? 1.5 : 1.2 }}
      animate={{ scale: 1 }}
      className={`flex size-8 items-center justify-center rounded-full tabular-nums ${
        sec <= 5 ? 'bg-answer-red text-white' : 'bg-white/90 text-brand'
      }`}
    >
      {sec}
    </motion.span>
  );
}

function AnswerButtons({ choiceCount }: { choiceCount: number }) {
  const shapes = SHAPES.slice(0, choiceCount);
  return (
    <div
      className={`grid flex-1 gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
        choiceCount === 2 ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2 grid-rows-2'
      }`}
    >
      {shapes.map((shape, i) => (
        <motion.button
          key={shape.index}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20, delay: i * 0.05 }}
          type="button"
          onPointerDown={(e) => {
            // Fire on touch-down for speed (points depend on response time).
            e.preventDefault();
            sendAnswer(shape.index);
          }}
          onClick={() => sendAnswer(shape.index)}
          aria-label={`Réponse ${shape.symbol}`}
          className={`flex touch-manipulation items-center justify-center rounded-2xl shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] active:brightness-90 ${shapeBg[shape.color]}`}
        >
          <ShapeIcon
            shape={shape.shape}
            className="size-1/2 max-h-32 max-w-32 fill-white drop-shadow"
          />
        </motion.button>
      ))}
    </div>
  );
}

function Answered({ choiceIndex }: { choiceIndex: number }) {
  const shape = SHAPES[choiceIndex] ?? SHAPES[0];
  return (
    <Message title="Réponse envoyée !" subtitle="On attend les autres…">
      <div className="relative">
        <motion.div
          className={`absolute inset-0 rounded-2xl ${shapeBg[shape.color]}`}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
          aria-hidden="true"
        />
        <motion.div
          className={`relative rounded-2xl p-6 ${shapeBg[shape.color]}`}
          initial={{ scale: 1.6, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 12 }}
        >
          <ShapeIcon shape={shape.shape} className="size-20 fill-white" />
        </motion.div>
      </div>
    </Message>
  );
}

function Result({ s }: { s: PlayerState }) {
  const r = s.result!;
  const answered = s.myAnswer?.questionIndex === s.questionIndex;
  const title = r.correct ? 'Correct !' : answered ? 'Raté !' : 'Temps écoulé !';
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center ${
        r.correct ? 'bg-answer-green' : 'bg-answer-red'
      }`}
    >
      <motion.div
        initial={{ scale: 0.3, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14 }}
        className="flex size-28 items-center justify-center rounded-full bg-white/20 text-7xl font-black"
        aria-hidden="true"
      >
        {r.correct ? '✓' : '✗'}
      </motion.div>
      <h2 className="text-4xl font-black">{title}</h2>
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="rounded-lg bg-black/25 px-5 py-2 text-2xl font-black tabular-nums"
      >
        {r.correct ? (
          <>
            + <CountUp value={r.pointsEarned} from={0} delay={250} /> pts
          </>
        ) : (
          '+ 0 pt'
        )}
      </motion.p>
      {r.streak >= 2 && <Streak streak={r.streak} bonus={r.streakBonus} />}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-lg font-bold"
      >
        Tu es {formatRank(r.rank)}
      </motion.p>
    </div>
  );
}

/** 🔥 streak badge: the flame flickers, the bonus pops in. */
function Streak({ streak, bonus }: { streak: number; bonus: number }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -15 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.35 }}
      className="flex items-center gap-2 rounded-full bg-black/25 px-5 py-2 text-xl font-black"
    >
      <motion.span
        aria-hidden="true"
        className="inline-block text-3xl"
        animate={{ scale: [1, 1.25, 0.95, 1.15, 1], rotate: [0, -8, 6, -4, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        🔥
      </motion.span>
      Série de {streak}
      {bonus > 0 && <span className="text-amber-200"> · bonus + {bonus}</span>}
    </motion.div>
  );
}

function Standings({ s }: { s: PlayerState }) {
  return (
    <Message
      title={s.result ? `Tu es ${formatRank(s.result.rank)}` : 'Classement'}
      subtitle="Regarde le classement sur l'écran"
    >
      <motion.p
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-5xl font-black tabular-nums"
      >
        {s.totalScore} pts
      </motion.p>
    </Message>
  );
}

const medals = ['🥇', '🥈', '🥉'];

function Podium({ s }: { s: PlayerState }) {
  const myPlace = s.podium?.findIndex((p) => p.nickname === s.nickname) ?? -1;
  const title =
    myPlace >= 0
      ? `${medals[myPlace]} Bravo, tu es ${formatRank(myPlace + 1)} !`
      : s.result
        ? `Tu termines ${formatRank(s.result.rank)}`
        : 'Podium';
  return (
    <Message title={title} subtitle={`${s.totalScore} pts`}>
      {myPlace === 0 && <Confetti count={60} />}
      {s.podium && (
        <ol className="flex w-full max-w-xs flex-col gap-2">
          {s.podium.map((p, i, all) => (
            <motion.li
              key={p.nickname}
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 + (all.length - 1 - i) * 0.25 }}
              className={`flex justify-between rounded-lg px-4 py-2 font-bold ${
                i === myPlace ? 'bg-white text-brand' : 'bg-white/15'
              }`}
            >
              <span className="truncate">
                {medals[i]} {p.nickname}
              </span>
              <span className="tabular-nums">{p.score}</span>
            </motion.li>
          ))}
        </ol>
      )}
    </Message>
  );
}

function End({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();
  return (
    <Message title={title} subtitle={subtitle}>
      <button
        type="button"
        onClick={() => {
          leaveGame();
          navigate('/join', { replace: true });
        }}
        className="touch-manipulation rounded-lg bg-white px-6 py-4 text-lg font-black text-brand active:scale-95"
      >
        Rejoindre une autre partie
      </button>
      <Link to="/" onClick={leaveGame} className="font-bold underline underline-offset-4">
        Accueil
      </Link>
    </Message>
  );
}

function Message({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h2 className="text-3xl font-black leading-tight">{title}</h2>
      {subtitle && <p className="text-lg font-semibold opacity-85">{subtitle}</p>}
      {children}
    </div>
  );
}

/** Waiting animation: the four answer shapes bounce in a wave. */
function BouncingShapes() {
  return (
    <div className="flex gap-3" aria-hidden="true">
      {SHAPES.map((shape, i) => (
        <motion.div
          key={shape.index}
          className={`rounded-lg p-2 ${shapeBg[shape.color]}`}
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        >
          <ShapeIcon shape={shape.shape} className="size-7 fill-white" />
        </motion.div>
      ))}
    </div>
  );
}
