import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  SHAPES,
  TEAM_NAMES,
  TYPE_ANSWER_MAX_LENGTH,
  type QuestionPromptPayload,
  type SliderPrompt,
  type TeamId,
} from '@lbq/shared';
import { Confetti, CountUp } from '../components/motion';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { formatValue, snapToStep } from '../lib/numbers';
import { competitionRanks } from '../lib/ranks';
import { errorMessage, formatRank, myTeam, playerScreen, type PlayerState } from './playerState';
import { chooseTeam, leaveGame, resumeSession, sendAnswer, usePlayerState } from './playerStore';
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
      if (s.mode === 'teams') return <TeamPicker s={s} />;
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
      return <AnswerScreen prompt={s.prompt!} />;
    case 'answered':
      return <Answered s={s} />;
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
  // Team mode: the header band takes the team color for the whole game.
  const team = myTeam(s);
  const shape = team ? SHAPES[team.id] : null;
  return (
    <header
      className={`flex items-center justify-between gap-2 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-bold ${
        shape ? shapeBg[shape.color] : 'bg-black/20'
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {shape && <ShapeIcon shape={shape.shape} className="size-4 shrink-0 fill-white" />}
        <span className="truncate">
          {s.nickname}
          {team && <span className="opacity-85"> · {team.name}</span>}
        </span>
      </span>
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

/** Shape buttons, a text field or a slider, depending on the question type. */
function AnswerScreen({ prompt }: { prompt: QuestionPromptPayload }) {
  if (prompt.type === 'TYPE_ANSWER')
    return <TextAnswer maxLength={prompt.maxLength ?? TYPE_ANSWER_MAX_LENGTH} />;
  if (prompt.type === 'SLIDER' && prompt.slider) return <SliderAnswer slider={prompt.slider} />;
  return <AnswerButtons choiceCount={prompt.choiceCount ?? 4} />;
}

/** Réponse libre: the keyboard opens right away; « Valider » sends the trimmed text. */
function TextAnswer({ maxLength }: { maxLength: number }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const answer = text.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (answer) sendAnswer({ text: answer });
      }}
      className="flex flex-1 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <h2 className="text-center text-2xl font-black">Écris ta réponse</h2>
      <input
        ref={input}
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ta réponse…"
        aria-label="Ta réponse"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="send"
        className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-black text-brand outline-none placeholder:text-brand/40"
      />
      <p className="-mt-2 text-right text-sm font-semibold opacity-80 tabular-nums">
        {text.length} / {maxLength}
      </p>
      <motion.button
        type="submit"
        disabled={!answer}
        whileTap={{ scale: 0.95 }}
        className="touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Valider
      </motion.button>
    </form>
  );
}

/** Curseur: big value, slider with − / + for fine tuning, « Valider ». */
function SliderAnswer({ slider }: { slider: SliderPrompt }) {
  const { min, max, step, unit } = slider;
  const [value, setValue] = useState(() => snapToStep((min + max) / 2, min, max, step));
  const nudge = (direction: 1 | -1) =>
    setValue((v) => snapToStep(v + direction * step, min, max, step));
  const nudgeClass =
    'flex size-14 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/20 text-3xl font-black active:bg-white/40';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-2xl font-black">Choisis ta valeur</h2>
      <p className="text-6xl font-black tabular-nums" aria-live="polite">
        {formatValue(value, unit)}
      </p>
      <div className="flex w-full items-center gap-3">
        <button type="button" aria-label="Moins" onClick={() => nudge(-1)} className={nudgeClass}>
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(snapToStep(Number(e.target.value), min, max, step))}
          aria-label="Ta valeur"
          className="slider-big min-w-0 flex-1"
        />
        <button type="button" aria-label="Plus" onClick={() => nudge(1)} className={nudgeClass}>
          +
        </button>
      </div>
      <div className="flex w-full justify-between px-16 text-sm font-bold opacity-80 tabular-nums">
        <span>{formatValue(min, unit)}</span>
        <span>{formatValue(max, unit)}</span>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={() => sendAnswer({ value })}
        className="w-full touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)]"
      >
        Valider
      </motion.button>
    </div>
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
            sendAnswer({ choiceIndex: shape.index });
          }}
          onClick={() => sendAnswer({ choiceIndex: shape.index })}
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

/** What the player sent, in words: « Pacifique », 1789 ans… (null for a shape). */
function answerLabel(s: PlayerState): string | null {
  const a = s.myAnswer;
  if (!a || 'choiceIndex' in a) return null;
  return 'text' in a ? `« ${a.text} »` : formatValue(a.value, s.prompt?.slider?.unit);
}

function Answered({ s }: { s: PlayerState }) {
  const label = answerLabel(s);
  if (label !== null) {
    return (
      <Message title="Réponse envoyée !" subtitle="On attend les autres…">
        <motion.p
          initial={{ scale: 1.4, rotate: -6 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 12 }}
          className="max-w-full break-words rounded-2xl bg-white px-6 py-4 text-3xl font-black text-brand"
        >
          {label}
        </motion.p>
      </Message>
    );
  }
  const a = s.myAnswer;
  const shape = SHAPES[a && 'choiceIndex' in a ? a.choiceIndex : 0] ?? SHAPES[0];
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
  if (r.poll) return <PollThanks s={s} voted={answered} />;
  const title = r.correct ? 'Correct !' : answered ? 'Raté !' : 'Temps écoulé !';
  const unit = s.prompt?.slider?.unit;
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
      {r.correctValue !== undefined ? (
        <p className="font-bold">
          {r.yourValue !== undefined && <>Ta réponse : {formatValue(r.yourValue, unit)} · </>}
          Bonne réponse : {formatValue(r.correctValue, unit)}
        </p>
      ) : (
        answered && answerLabel(s) && <p className="font-bold">Ta réponse : {answerLabel(s)}</p>
      )}
      {r.streak >= 2 && <Streak streak={r.streak} bonus={r.streakBonus} />}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-lg font-bold"
      >
        Tu es {formatRank(r.rank)}
      </motion.p>
      {r.team && <TeamLine {...r.team} />}
    </div>
  );
}

/** Poll: no right or wrong, no points; the streak is untouched. */
function PollThanks({ s, voted }: { s: PlayerState; voted: boolean }) {
  const r = s.result!;
  return (
    <Message
      title={voted ? 'Merci pour ton vote !' : 'Sondage terminé'}
      subtitle="Regarde les résultats sur l'écran"
    >
      <motion.p
        initial={{ scale: 0.3, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14 }}
        className="text-7xl"
        aria-hidden="true"
      >
        🗳️
      </motion.p>
      {r.streak >= 2 && <Streak streak={r.streak} bonus={0} />}
      <p className="text-lg font-bold">Tu es {formatRank(r.rank)}</p>
      {r.team && <TeamLine {...r.team} />}
    </Message>
  );
}

/** Team mode: the team's score and rank (score = average of its players). */
function TeamLine({ id, score, rank }: { id: TeamId; score: number; rank: number }) {
  const shape = SHAPES[id];
  return (
    <motion.p
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6 }}
      className={`flex items-center gap-2 rounded-full px-4 py-2 font-black shadow ${shapeBg[shape.color]}`}
    >
      <ShapeIcon shape={shape.shape} className="size-5 fill-white" />
      {TEAM_NAMES[id]} : {formatRank(rank, true)} · {score} pts
    </motion.p>
  );
}

/** Team mode, lobby: big team buttons with their members; tap to join / switch. */
function TeamPicker({ s }: { s: PlayerState }) {
  const mine = myTeam(s);
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">
        {mine ? `Tu es dans l'${mine.name.replace('Équipe', 'équipe')} !` : 'Choisis ton équipe'}
      </h2>
      <p className="text-center text-sm font-semibold opacity-85">
        {mine
          ? 'Tu peux changer jusqu’au début de la partie.'
          : 'Touche une équipe pour la rejoindre.'}
      </p>
      {s.teams.map((t) => {
        const shape = SHAPES[t.id];
        const selected = mine?.id === t.id;
        return (
          <motion.button
            key={t.id}
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => chooseTeam(t.id)}
            aria-pressed={selected}
            className={`flex min-h-20 flex-1 touch-manipulation items-center gap-4 rounded-2xl px-5 py-3 text-left shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] ${shapeBg[shape.color]} ${
              selected ? 'ring-4 ring-white' : mine ? 'opacity-70' : ''
            }`}
          >
            <ShapeIcon shape={shape.shape} className="size-12 shrink-0 fill-white drop-shadow" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xl font-black">
                {t.name}
                {selected && ' ✓'}
              </span>
              <span className="truncate text-sm font-semibold opacity-90">
                {t.members.length === 0
                  ? 'Personne pour l’instant'
                  : t.members.map((m) => m.nickname).join(', ')}
              </span>
            </span>
            <span className="rounded-lg bg-black/25 px-3 py-1 text-xl font-black tabular-nums">
              {t.members.length}
            </span>
          </motion.button>
        );
      })}
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
      {s.result?.team && <TeamLine {...s.result.team} />}
    </Message>
  );
}

const medals = ['🥇', '🥈', '🥉'];

function Podium({ s }: { s: PlayerState }) {
  if (s.podiumTeams.length > 0) return <TeamPodium s={s} />;
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

/** Team mode: the team ranking, ours highlighted, + our own rank. */
function TeamPodium({ s }: { s: PlayerState }) {
  const teams = s.podiumTeams;
  const ranks = competitionRanks(teams.map((t) => t.score));
  const mine = myTeam(s);
  const index = teams.findIndex((t) => t.id === mine?.id);
  const teamRank = index >= 0 ? ranks[index]! : null;
  const title =
    teamRank === 1
      ? '🏆 Ton équipe gagne !'
      : teamRank
        ? `Ton équipe termine ${formatRank(teamRank, true)}`
        : 'Podium des équipes';
  const subtitle = s.result
    ? `Tu termines ${formatRank(s.result.rank)} · ${s.totalScore} pts`
    : `${s.totalScore} pts`;
  return (
    <Message title={title} subtitle={subtitle}>
      {teamRank === 1 && <Confetti count={60} />}
      <ol className="flex w-full max-w-xs flex-col gap-2">
        {teams.map((t, i) => (
          <motion.li
            key={t.id}
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 + (teams.length - 1 - i) * 0.25 }}
            className={`flex items-center justify-between gap-2 rounded-lg px-4 py-2 font-bold ${shapeBg[SHAPES[t.id].color]} ${
              t.id === mine?.id ? 'ring-4 ring-white' : ''
            }`}
          >
            <span className="truncate">
              {formatRank(ranks[i]!, true)} · {t.name}
            </span>
            <span className="tabular-nums">{t.score}</span>
          </motion.li>
        ))}
      </ol>
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
