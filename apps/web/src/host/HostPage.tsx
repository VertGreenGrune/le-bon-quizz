import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { QUESTION_INTRO_MS, type ErrorPayload, type GamePhase as HostPhase } from '@lbq/shared';
import { parseGameOptions } from '../lib/gameOptions';
import { currentQuestion, isLastQuestion, teamLobbyStatus } from './hostReducer';
import { TeamLobby, TeamPodiumScreen } from './teamScreens';
import { createGame, loadHostToken, useHostGame, useNow } from './useHostGame';
import {
  LeaderboardScreen,
  LobbyScreen,
  PodiumScreen,
  QuestionIntroScreen,
  QuestionScreen,
} from './screens';
import { setMuted, useHostSounds, useMuted } from './sounds';

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
  const isNew = pinParam === 'new';
  const pin = isNew ? undefined : pinParam;
  const [hostToken, setHostToken] = useState(() => (pin ? loadHostToken(pin) : null));
  const [createError, setCreateError] = useState<ErrorPayload | null>(null);

  const game = useHostGame(pin, hostToken);
  const { state } = game;

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    const options = parseGameOptions(new URLSearchParams({ mode: mode ?? '', teams: teams ?? '' }));
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
  }, [isNew, quizId, mode, teams, navigate]);

  const timed = state.deadline != null;
  const now = useNow(timed);
  const remainingMs = timed ? Math.max(0, state.deadline! - now) : null;
  const remainingSec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;

  useHostSounds({ phase: state.phase, remainingSec, playerCount: state.players.length });

  // The first screen shown after a (re)load is a resync (host:rejoin): it appears without its
  // entrance animations (podium reveal, re-ordering…) instead of replaying them.
  const screenKey = screenKeyFor(state.phase, state.questionIndex);
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

  let screen: ReactNode;
  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  switch (phase) {
    case 'LOBBY':
      screen = (
        <LobbyScreen
          pin={pin}
          players={state.players}
          onKick={game.kick}
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
      screen = (
        <QuestionIntroScreen
          index={state.questionIndex}
          total={state.totalQuestions}
          question={question}
          progress={remainingMs != null ? 1 - remainingMs / QUESTION_INTRO_MS : null}
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
        />
      );
      primary =
        phase === 'ANSWERING'
          ? { label: 'Passer', onClick: game.next }
          : { label: 'Suivant', onClick: game.next };
      break;
    case 'LEADERBOARD':
      screen = (
        <LeaderboardScreen
          top={state.leaderboard}
          previous={state.previousLeaderboard}
          instant={instant}
          teams={state.leaderboardTeams}
        />
      );
      primary = {
        label: isLastQuestion(state) ? 'Voir le podium' : 'Question suivante',
        onClick: game.next,
      };
      break;
    case 'PODIUM':
    case 'ENDED':
      screen =
        state.podiumTeams.length > 0 ? (
          <TeamPodiumScreen teams={state.podiumTeams} top={state.podium} instant={instant} />
        ) : (
          <PodiumScreen top={state.podium} instant={instant} />
        );
      if (phase === 'PODIUM') primary = { label: 'Terminer la partie', onClick: game.end };
      break;
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex min-h-dvh flex-col bg-brand text-white select-none">
        <header className="flex items-center gap-4 px-6 py-3 text-lg font-semibold">
          <Link to="/" className="font-black">
            Le Bon Quizz
          </Link>
          {phase !== 'LOBBY' && <span className="opacity-80">PIN {pin}</span>}
          {state.questionIndex >= 0 && phase !== 'PODIUM' && phase !== 'ENDED' && (
            <span className="opacity-80">
              Question {state.questionIndex + 1} / {state.totalQuestions}
            </span>
          )}
          <span className="flex-1" />
          {!game.connected && (
            <span className="rounded bg-answer-red px-3 py-1">Connexion au serveur perdue…</span>
          )}
          <MuteButton />
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
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.2 }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>

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
            <Link to="/" className="rounded-xl bg-white px-8 py-4 text-2xl font-black text-brand">
              Retour à l'accueil
            </Link>
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
      </main>
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

/** Sound on/off, remembered in localStorage. */
function MuteButton() {
  const muted = useMuted();
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? 'Activer le son' : 'Couper le son'}
      title={muted ? 'Activer le son' : 'Couper le son'}
      aria-pressed={muted}
      className="rounded-lg border-2 border-white/60 px-3 py-1 text-xl hover:bg-white/10"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
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
