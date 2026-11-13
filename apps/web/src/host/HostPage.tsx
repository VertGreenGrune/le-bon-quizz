import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AuctionBidScreen, AuctionRevealStrip } from './auctionScreens';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  QUESTION_INTRO_MS,
  jokerAvailability,
  type ErrorPayload,
  type GamePhase as HostPhase,
} from '@lbq/shared';
import { parseGameOptions } from '../lib/gameOptions';
import { ChainQuizDialog } from '../components/ChainQuizDialog';
import { getTheme } from '../themes';
import { ThemedMain } from '../themes/ThemedMain';
import { JokerAnnouncements } from './jokerScreens';
import { ThiefWheels } from './thiefWheel';
import {
  currentDrawing,
  currentQuestion,
  isBidding,
  podiumIsNext,
  offlinePlayers,
  remainingMsAt,
  teamLobbyStatus,
} from './hostReducer';
import { ComebackToasts, PauseOverlay, nicknameList } from './pauseScreens';
import { TeamLobby, TeamPodiumScreen } from './teamScreens';
import { EliminationMoment, SurvivalBadge } from './survivalScreens';
import { useQuestionClip } from './clipPlayer';
import { CastButton, isTvScreen } from './castToTv';
import { useWakeLock } from '../player/useWakeLock';
import { useTvScale } from './tvScale';
import { EveningPanel, EveningScreen } from './eveningScreens';
import { RemoteButton, RemoteToast, useRemotePairing, useTvControls } from './remoteLink';
import { createGame, loadHostToken, useHostGame, useNow } from './useHostGame';
import {
  LeaderboardScreen,
  LobbyScreen,
  PodiumScreen,
  QuestionIntroScreen,
  QuestionScreen,
} from './screens';
import { useThemeRadio } from './radio';
import { useHostSounds } from './sounds';
import { SoundButton } from './soundSettings';

/**
 * Shared screen (TV/projector). `/host/new?quizId=<id>[&mode=teams&teams=<n>]` creates a game
 * (demo quiz without `quizId`, solo without `mode`) then redirects to `/host/:pin`; the same
 * component instance stays mounted across that redirect.
 */
export function HostPage() {
  const { pin: pinParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quizId') ?? undefined;
  const mode = searchParams.get('mode');
  const teams = searchParams.get('teams');
  const hearts = searchParams.get('hearts');
  const jokers = searchParams.get('jokers');
  const themeParam = searchParams.get('theme');
  const testParam = searchParams.get('test');
  const questionParam = searchParams.get('question');
  const isNew = pinParam === 'new';
  const pin = isNew ? undefined : pinParam;
  const [hostToken, setHostToken] = useState(() => (pin ? loadHostToken(pin) : null));
  const [createError, setCreateError] = useState<ErrorPayload | null>(null);

  const game = useHostGame(pin, hostToken);
  const { state } = game;

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    const options = parseGameOptions(
      new URLSearchParams({
        mode: mode ?? '',
        teams: teams ?? '',
        hearts: hearts ?? '',
        jokers: jokers ?? '',
        theme: themeParam ?? '',
        test: testParam ?? '',
        question: questionParam ?? '',
      }),
    );
    createGame(quizId, options).then(
      (res) => {
        if (cancelled) return;
        setHostToken(res.hostToken);
        navigate(`/host/${res.pin}`, { replace: true });
      },
      (err: ErrorPayload) => !cancelled && setCreateError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [isNew, quizId, mode, teams, hearts, jokers, themeParam, testParam, questionParam, navigate]);

  const timed = state.deadline != null;
  const now = useNow(timed || state.paused !== null || state.comebacks.length > 0);
  const remainingMs = remainingMsAt(state, now);
  const remainingSec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;
  const resumeCount =
    state.resumeAt !== null ? Math.max(0, Math.ceil((state.resumeAt - now) / 1000)) : null;
  const offline = offlinePlayers(state);

  const holder = state.buzzer?.holder ?? null;
  // « 📻 Radio du thème »: background music the whole game, silent for a question's sound.
  const radio = useThemeRadio(state.phase, currentQuestion(state), state.theme);
  useHostSounds({
    phase: state.phase,
    // Paused / someone answering out loud: the clock doesn't tick, the 3-2-1 countdown does.
    remainingSec: state.paused || holder ? null : remainingSec,
    resumeCount,
    playerCount: state.players.length,
    buzzerHolder: holder?.id ?? null,
    theme: state.theme,
    radio,
    potato: currentQuestion(state)?.type === 'HOT_POTATO',
  });

  // Sound clip of the question (host screen only): paused with the game, until the 3-2-1 ends,
  // and while a player answers out loud (« Buzzer »).
  const clip = useQuestionClip(
    currentQuestion(state),
    state.phase,
    state.paused !== null || holder !== null,
  );
  // « 📱 Télécommande » (T39): pairing, and the TV controls pressed on the remote.
  const pairing = useRemotePairing(pin, hostToken);
  const [onTv] = useState(isTvScreen);
  const [chaining, setChaining] = useState(false);
  // « 🌙 Classement de la soirée » (T66) instead of the podium, toggled by the TV or the remote.
  const [showEvening, setShowEvening] = useState(false);
  const eveningShown =
    showEvening && !!state.evening && (state.phase === 'PODIUM' || state.phase === 'ENDED');
  useWakeLock(onTv);
  useTvScale();
  useTvControls(clip.replay, () => setShowEvening((v) => !v));
  useEffect(() => setShowEvening(false), [state.round]); // a new quiz: its podium first

  // The first screen shown after a (re)load is a resync (host:rejoin): it appears without its
  // entrance animations (podium reveal, re-ordering…) instead of replaying them.
  const screenKey = isBidding(state)
    ? `auction-${state.questionIndex}`
    : screenKeyFor(state.phase, state.questionIndex);
  const view = `${screenKey}/${state.phase}`;
  const firstView = useRef<string | null>(null);
  if (state.phase !== null) firstView.current ??= view;
  const instant = view === firstView.current;

  if (createError)
    return (
      <Message
        title="Impossible de créer la partie"
        detail={createError.message}
        onRetry={() => location.reload()}
      />
    );
  if (isNew || !pin) return <Message title="Création de la partie…" />;
  if (!hostToken) {
    return (
      <Message
        title="Session d'animation introuvable"
        detail="Cette partie a été créée dans un autre onglet ou la page a perdu sa session."
      />
    );
  }

  if (game.lost) {
    return (
      <Message
        title="Partie introuvable"
        detail="Cette partie est terminée ou le serveur a redémarré."
      />
    );
  }

  // The lobby is shown until the first game:state, in case the server doesn't send one on create.
  const phase = state.phase ?? 'LOBBY';
  const question = currentQuestion(state);
  const teamMode = state.mode === 'teams';
  const survival = state.survival;

  let screen: ReactNode;
  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  switch (phase) {
    case 'LOBBY':
      screen = (
        <LobbyScreen
          pin={pin}
          quizTitle={state.quizTitle}
          players={state.players}
          onKick={game.kick}
          hearts={survival?.hearts}
          evening={state.evening && <EveningPanel evening={state.evening} />}
          test={state.test}
          teamLobby={
            teamMode ? (
              <TeamLobby
                players={state.players}
                teams={state.teams}
                onMove={game.movePlayer}
                onKick={game.kick}
                onShuffle={game.shuffle}
              />
            ) : undefined
          }
        />
      );
      primary = {
        label: 'Commencer',
        onClick: game.start,
        disabled: teamMode ? !teamLobbyStatus(state).ready : state.players.length === 0,
      };
      break;
    case 'QUESTION_INTRO':
      // « Enchères » (T64): the bids first, without the question.
      if (state.auction && isBidding(state)) {
        screen = (
          <AuctionBidScreen
            index={state.questionIndex}
            total={state.totalQuestions}
            auction={state.auction}
            players={state.players}
            remainingMs={remainingMs}
          />
        );
        primary = { label: 'Fermer les enchères', onClick: game.next };
        break;
      }
      screen = (
        <QuestionIntroScreen
          index={state.questionIndex}
          total={state.totalQuestions}
          question={question}
          progress={
            remainingMs != null ? 1 - remainingMs / (state.introMs ?? QUESTION_INTRO_MS) : null
          }
          remainingMs={remainingMs}
          jokers={
            state.jokers && !!question && jokerAvailability(question.type, !!question.buzzer).jokers
          }
        />
      );
      break;
    case 'ANSWERING':
    case 'REVEAL':
      screen = (
        <QuestionScreen
          question={question}
          remainingMs={remainingMs}
          answered={state.answered}
          answerTotal={state.answerTotal}
          reveal={phase === 'REVEAL' ? state.reveal : null}
          instant={instant}
          onReplay={clip.replay}
          buzzer={state.buzzer}
          onJudge={game.judge}
          onAccept={(input) => question && game.accept(question.index, input)}
          draw={state.draw}
          drawing={currentDrawing(state)}
          list={state.list}
          wager={state.wager}
          potato={state.potato}
          paused={state.paused !== null}
        />
      );
      primary =
        phase === 'ANSWERING'
          ? { label: 'Passer', onClick: game.next }
          : { label: podiumIsNext(state) ? 'Voir le podium' : 'Suivant', onClick: game.next };
      break;
    case 'LEADERBOARD':
      screen = (
        <LeaderboardScreen
          top={state.leaderboard}
          previous={state.previousLeaderboard}
          instant={instant}
          teams={state.leaderboardTeams}
          survival={survival}
          questionIndex={state.questionIndex}
        />
      );
      primary = {
        label: podiumIsNext(state) ? 'Voir le podium' : 'Question suivante',
        onClick: game.next,
      };
      break;
    case 'PODIUM':
    case 'ENDED':
      screen = eveningShown ? (
        <EveningScreen evening={state.evening!} instant={instant} />
      ) : state.podiumTeams.length > 0 ? (
        <TeamPodiumScreen teams={state.podiumTeams} top={state.podium} instant={instant} />
      ) : (
        <PodiumScreen top={state.podium} instant={instant} maxHearts={survival?.hearts} />
      );
      if (phase === 'PODIUM') primary = { label: 'Terminer la partie', onClick: game.end };
      break;
  }

  return (
    <MotionConfig reducedMotion="user">
      <ThemedMain
        theme={getTheme(state.theme)}
        className="flex h-dvh flex-col overflow-hidden select-none"
      >
        <header className="flex items-center gap-4 px-6 py-3 text-lg font-semibold">
          <Link to="/" className="font-display font-black">
            Le Bon Quizz
          </Link>
          {phase !== 'LOBBY' && <span className="opacity-80">PIN {pin}</span>}
          {state.test && (
            <span
              className="rounded-full bg-white px-3 py-0.5 text-base font-black text-brand"
              data-testid="test-badge"
            >
              🧪 Test
            </span>
          )}
          {phase !== 'LOBBY' && state.quizTitle && (
            <span className="max-w-md truncate opacity-60" title={state.quizTitle}>
              {state.quizTitle}
            </span>
          )}
          {survival && <SurvivalBadge survival={survival} />}
          {state.jokers && (
            <span className="rounded bg-white/15 px-2" title="Partie avec jokers">
              🃏 Jokers
            </span>
          )}
          {state.questionIndex >= 0 && phase !== 'PODIUM' && phase !== 'ENDED' && (
            <span className="opacity-80">
              Question {state.questionIndex + 1} / {state.totalQuestions}
            </span>
          )}
          <span className="flex-1" />
          {!game.connected && (
            <span className="rounded bg-answer-red px-3 py-1">Connexion au serveur perdue…</span>
          )}
          {game.connected && !state.paused && offline.length > 0 && phase !== 'ENDED' && (
            <span className="rounded bg-panel px-3 py-1" data-testid="offline-players">
              📵 {nicknameList(offline)} {offline.length > 1 ? 'sont' : 'est'} hors ligne
            </span>
          )}
          {phase !== 'ENDED' && !onTv && hostToken && (
            <CastButton pin={pin} hostToken={hostToken} remoteToken={pairing.remoteToken} />
          )}
          {phase !== 'ENDED' && (
            <RemoteButton pin={pin} remotes={pairing.remotes} remoteToken={pairing.remoteToken} />
          )}
          <SoundButton />
          {phase !== 'ENDED' && phase !== 'PODIUM' && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Terminer la partie maintenant ?')) game.end();
              }}
              className="rounded-lg border-2 border-white/60 px-4 py-1 hover:bg-white/10"
            >
              Terminer
            </button>
          )}
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.2 }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {state.paused && (
            <PauseOverlay state={state} now={now} onResume={game.resume} onKick={game.kick} />
          )}
        </AnimatePresence>
        <ComebackToasts state={state} now={now} />
        <RemoteToast text={pairing.toast} />
        {(state.jokers || state.mode === 'survival') && <JokerAnnouncements />}
        {phase === 'REVEAL' && state.reveal?.wheels && (
          <ThiefWheels key={state.questionIndex} wheels={state.reveal.wheels} instant={instant} />
        )}
        {phase === 'REVEAL' && state.reveal?.auction && (
          <AuctionRevealStrip bids={state.reveal.auction.bids} instant={instant} />
        )}
        {phase === 'LEADERBOARD' && survival && !instant && (
          <EliminationMoment survival={survival} questionIndex={state.questionIndex} />
        )}

        <footer className="flex min-h-20 items-center justify-end gap-4 px-6 pb-6">
          {game.error && (
            <button
              type="button"
              onClick={game.clearError}
              className="mr-auto rounded-lg bg-answer-red px-4 py-2 text-lg font-semibold"
            >
              {game.error.message} ✕
            </button>
          )}
          {phase === 'ENDED' && (
            <Link
              to="/"
              className="rounded-xl border-2 border-white/70 px-8 py-4 text-2xl font-black"
            >
              Retour à l'accueil
            </Link>
          )}
          {(phase === 'PODIUM' || phase === 'ENDED') && state.evening && (
            <button
              type="button"
              onClick={() => setShowEvening((v) => !v)}
              className="rounded-xl border-2 border-white/70 px-6 py-4 text-2xl font-black hover:bg-white/10"
            >
              {eveningShown ? '🏆 Podium du quiz' : '🌙 Classement de la soirée'}
            </button>
          )}
          {(phase === 'PODIUM' || phase === 'ENDED') && (
            <button
              type="button"
              onClick={() => setChaining(true)}
              className="rounded-xl bg-white px-8 py-4 text-2xl font-black text-brand shadow-lg"
            >
              🔁 Enchaîner un quiz
            </button>
          )}
          {(phase === 'QUESTION_INTRO' || phase === 'ANSWERING') && !state.paused && (
            <button
              type="button"
              onClick={game.pause}
              className="rounded-xl border-2 border-white/70 px-6 py-4 text-2xl font-black hover:bg-white/10"
            >
              ⏸ Pause
            </button>
          )}
          {primary && (
            <motion.button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              whileHover={primary.disabled ? undefined : { scale: 1.05 }}
              whileTap={primary.disabled ? undefined : { scale: 0.94 }}
              className="rounded-xl bg-white px-10 py-4 text-2xl font-black text-brand shadow-lg disabled:opacity-50"
            >
              {primary.label}
            </motion.button>
          )}
        </footer>
        {chaining && (
          <ChainQuizDialog actions={game.chainActions} onClose={() => setChaining(false)} />
        )}
      </ThemedMain>
    </MotionConfig>
  );
}

/** One key per screen: ANSWERING → REVEAL keeps the same screen (the reveal animates in place). */
function screenKeyFor(phase: HostPhase | null, questionIndex: number): string {
  switch (phase) {
    case null:
    case 'LOBBY':
      return 'lobby';
    case 'QUESTION_INTRO':
      return `intro-${questionIndex}`;
    case 'ANSWERING':
    case 'REVEAL':
      return `question-${questionIndex}`;
    case 'LEADERBOARD':
      return `leaderboard-${questionIndex}`;
    case 'PODIUM':
    case 'ENDED':
      return 'podium';
  }
}

function Message({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-brand p-8 text-center text-white">
      <h1 className="text-4xl font-black">{title}</h1>
      {detail && <p className="text-xl opacity-80">{detail}</p>}
      <div className="mt-4 flex gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-white px-6 py-3 font-bold text-brand"
          >
            Réessayer
          </button>
        )}
        <Link to="/" className="rounded-lg border-2 border-white px-6 py-3 font-bold">
          Retour à l'accueil
        </Link>
      </div>
    </main>
  );
}
