import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { SHAPES } from '@lbq/shared';
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
          <Spinner />
        </Message>
      );
    case 'getReady':
      return (
        <Message
          title={`Question ${s.questionIndex + 1}`}
          subtitle="Prépare-toi… regarde l'écran !"
        >
          <Spinner />
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
        <span className="rounded bg-white px-2 py-0.5 text-brand">{s.totalScore}</span>
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
    <span className="flex size-8 items-center justify-center rounded-full bg-white/90 text-brand tabular-nums">
      {sec}
    </span>
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
      {shapes.map((shape) => (
        <button
          key={shape.index}
          type="button"
          onPointerDown={(e) => {
            // Fire on touch-down for speed (points depend on response time).
            e.preventDefault();
            sendAnswer(shape.index);
          }}
          onClick={() => sendAnswer(shape.index)}
          aria-label={`Réponse ${shape.symbol}`}
          className={`flex touch-manipulation items-center justify-center rounded-2xl shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] transition active:scale-95 active:brightness-90 ${shapeBg[shape.color]}`}
        >
          <ShapeIcon
            shape={shape.shape}
            className="size-1/2 max-h-32 max-w-32 fill-white drop-shadow"
          />
        </button>
      ))}
    </div>
  );
}

function Answered({ choiceIndex }: { choiceIndex: number }) {
  const shape = SHAPES[choiceIndex] ?? SHAPES[0];
  return (
    <Message title="Réponse envoyée !" subtitle="On attend les autres…">
      <div className={`rounded-2xl p-6 ${shapeBg[shape.color]}`}>
        <ShapeIcon shape={shape.shape} className="size-20 fill-white" />
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
      <p className="rounded-lg bg-black/25 px-5 py-2 text-2xl font-black">
        {r.correct ? `+ ${r.pointsEarned} pts` : '+ 0 pt'}
      </p>
      {r.streak >= 2 && (
        <p className="text-xl font-black">
          🔥 Série de {r.streak}
          {r.streakBonus > 0 && ` · bonus + ${r.streakBonus}`}
        </p>
      )}
      <p className="text-lg font-bold">Tu es {formatRank(r.rank)}</p>
    </div>
  );
}

function Standings({ s }: { s: PlayerState }) {
  return (
    <Message
      title={s.result ? `Tu es ${formatRank(s.result.rank)}` : 'Classement'}
      subtitle="Regarde le classement sur l'écran"
    >
      <p className="text-5xl font-black tabular-nums">{s.totalScore} pts</p>
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
      {s.podium && (
        <ol className="flex w-full max-w-xs flex-col gap-2">
          {s.podium.map((p, i) => (
            <li
              key={p.nickname}
              className={`flex justify-between rounded-lg px-4 py-2 font-bold ${
                i === myPlace ? 'bg-white text-brand' : 'bg-white/15'
              }`}
            >
              <span className="truncate">
                {medals[i]} {p.nickname}
              </span>
              <span className="tabular-nums">{p.score}</span>
            </li>
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

function Spinner() {
  return (
    <div
      className="size-12 animate-spin rounded-full border-4 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}
