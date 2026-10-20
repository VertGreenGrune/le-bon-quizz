import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { QUESTION_INTRO_MS, type ErrorPayload } from '@lbq/shared';
import { currentQuestion, isLastQuestion } from './hostReducer';
import { createGame, loadHostToken, useHostGame, useNow } from './useHostGame';
import {
  LeaderboardScreen,
  LobbyScreen,
  PodiumScreen,
  QuestionIntroScreen,
  QuestionScreen,
} from './screens';

/**
 * Shared screen (TV/projector). `/host/new?quizId=<id>` creates a game (demo quiz without
 * `quizId`) then redirects to `/host/:pin`; the same component instance stays mounted across
 * that redirect.
 */
export function HostPage() {
  const { pin: pinParam } = useParams();
  const navigate = useNavigate();
  const quizId = useSearchParams()[0].get('quizId') ?? undefined;
  const isNew = pinParam === 'new';
  const pin = isNew ? undefined : pinParam;
  const [hostToken, setHostToken] = useState(() => (pin ? loadHostToken(pin) : null));
  const [createError, setCreateError] = useState<ErrorPayload | null>(null);

  const game = useHostGame(pin, hostToken);
  const { state } = game;

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    createGame(quizId).then(
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
  }, [isNew, quizId, navigate]);

  const timed = state.deadline != null;
  const now = useNow(timed);
  const remainingMs = timed ? Math.max(0, state.deadline! - now) : null;

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

  let screen: ReactNode;
  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  switch (phase) {
    case 'LOBBY':
      screen = <LobbyScreen pin={pin} players={state.players} onKick={game.kick} />;
      primary = { label: 'Commencer', onClick: game.start, disabled: state.players.length === 0 };
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
          remainingSec={remainingMs != null ? Math.ceil(remainingMs / 1000) : null}
          answered={state.answered}
          answerTotal={state.answerTotal}
          reveal={phase === 'REVEAL' ? state.reveal : null}
        />
      );
      primary =
        phase === 'ANSWERING'
          ? { label: 'Passer', onClick: game.next }
          : { label: 'Suivant', onClick: game.next };
      break;
    case 'LEADERBOARD':
      screen = <LeaderboardScreen top={state.leaderboard} />;
      primary = {
        label: isLastQuestion(state) ? 'Voir le podium' : 'Question suivante',
        onClick: game.next,
      };
      break;
    case 'PODIUM':
      screen = <PodiumScreen top={state.podium} />;
      primary = { label: 'Terminer la partie', onClick: game.end };
      break;
    case 'ENDED':
      screen = <PodiumScreen top={state.podium} />;
      break;
  }

  return (
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

      {screen}

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
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="rounded-xl bg-white px-10 py-4 text-2xl font-black text-brand shadow-lg transition hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {primary.label}
          </button>
        )}
      </footer>
    </main>
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
