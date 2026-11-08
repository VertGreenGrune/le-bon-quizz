import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { SHAPES, TEAM_NAMES, type LobbyMember, type QuestionType, type TeamId } from '@lbq/shared';
import { GainBadge } from '../components/GainBadge';
import { Avatar } from '../components/Avatar';
import { PinPicture, PinZoneMark } from '../components/PinPicture';
import { QUESTION_TYPES } from '../editor/draft';
import { currentQuestion, remainingMsAt, type HostGameState } from '../host/hostReducer';
import { nicknameList } from '../host/pauseScreens';
import { useNow } from '../host/useHostGame';
import { acceptOptions, nextSliderMargin, type AcceptInput } from '../host/accept';
import { AcceptButton, AcceptedTag } from '../host/acceptControls';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { formatValue } from '../lib/numbers';
import { useWakeLock } from '../player/useWakeLock';
import {
  currentAnswer,
  loadRemoteToken,
  mainAction,
  phaseLabel,
  tokenFromHash,
  type RemoteState,
} from './remoteState';
import { useRemote } from './useRemote';

const TEAM_BG = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'];

/** The token of the link (then hidden from the address bar), or the one kept for this PIN. */
function useRemoteToken(pin: string): string | null {
  const [token] = useState(() => tokenFromHash(location.hash) ?? loadRemoteToken(pin));
  useEffect(() => {
    // Out of sight of the players looking over the host's shoulder (saved once paired).
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }, []);
  return token;
}

/**
 * `/remote/:pin#<remoteToken>` — the host's phone as a remote (T39): next / pause / buzzer
 * judging / the answer in secret, without standing by the TV. Portrait, one hand.
 */
export function RemotePage() {
  const { pin = '' } = useParams();
  const token = useRemoteToken(pin);
  const remote = useRemote(pin, token);
  const { state } = remote;
  const host = state.host;
  useWakeLock(!!token && !remote.lost && !state.revoked && host.phase !== 'ENDED');

  // Someone buzzed: a short vibration, the host has to judge.
  const holderId = host.buzzer?.holder?.id ?? null;
  useEffect(() => {
    if (holderId) navigator.vibrate?.(200);
  }, [holderId]);

  const now = useNow(host.deadline != null || host.paused !== null || host.resumeAt !== null, 250);

  if (!token)
    return (
      <Screen>
        <Notice
          title="Lien de télécommande invalide"
          detail="Scanne le QR code « 📱 Télécommande » affiché sur l'écran de la partie."
        />
      </Screen>
    );
  if (state.revoked || remote.lost?.code === 'UNAUTHORIZED')
    return (
      <Screen>
        <Notice
          title="Télécommande déconnectée"
          detail="L'animateur a déconnecté cette télécommande. Scanne le nouveau QR code sur l'écran pour la reconnecter."
        />
      </Screen>
    );
  if (remote.lost)
    return (
      <Screen>
        <Notice
          title="Partie introuvable"
          detail="Cette partie est terminée ou le serveur a redémarré."
        />
      </Screen>
    );

  const main = mainAction(host);
  const phase = host.phase;
  const timed = phase === 'QUESTION_INTRO' || phase === 'ANSWERING';
  const remainingMs = remainingMsAt(host, now);
  const question = currentQuestion(host);

  return (
    <Screen>
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-brand/95 px-4 py-3 backdrop-blur">
        <div className="flex-1">
          <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
            📱 Télécommande · PIN {pin}
          </p>
          {host.quizTitle && (
            <p className="truncate text-sm font-semibold opacity-80">{host.quizTitle}</p>
          )}
          <p className="text-lg font-black" data-testid="remote-phase">
            {host.phase ? phaseLabel(host) : 'Connexion…'}
          </p>
        </div>
        {timed && remainingMs != null && (
          <span
            className={`rounded-xl px-3 py-1 text-2xl font-black tabular-nums ${
              host.paused ? 'bg-white/20' : 'bg-white text-brand'
            }`}
            data-testid="remote-timer"
          >
            {host.paused ? '⏸ ' : ''}
            {Math.ceil(remainingMs / 1000)}
          </span>
        )}
      </header>
      {!remote.connected && (
        <p className="bg-answer-red px-4 py-2 text-center font-bold" role="status">
          Reconnexion…
        </p>
      )}

      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        {(phase === null || phase === 'LOBBY') && <LobbyPanel state={host} remote={remote} />}
        {(phase === 'QUESTION_INTRO' || phase === 'ANSWERING' || phase === 'REVEAL') && (
          <>
            {host.paused && <PausePanel state={host} now={now} remote={remote} />}
            <QuestionPanel state={state} />
            {host.buzzer?.holder && (
              <BuzzerPanel holder={host.buzzer.holder} onJudge={remote.judge} />
            )}
            <AnswerPeek key={host.questionIndex} state={state} />
            {phase === 'REVEAL' && <AcceptPanel state={host} remote={remote} />}
          </>
        )}
        {phase === 'LEADERBOARD' && (
          <Standings title="Classement" top={host.leaderboard.slice(0, 5)} />
        )}
        {(phase === 'PODIUM' || phase === 'ENDED') && (
          <Standings
            title={phase === 'ENDED' ? 'Partie terminée 🎉' : 'Podium'}
            top={host.podium}
          />
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-col gap-3 bg-brand/95 px-4 pt-3 pb-5 backdrop-blur">
        {remote.error && (
          <button
            type="button"
            onClick={remote.clearError}
            className="rounded-lg bg-answer-red px-3 py-2 text-left font-semibold"
          >
            {remote.error.message} ✕
          </button>
        )}
        {timed && (
          <button
            type="button"
            onClick={() => remote.send(host.paused?.byHost ? 'host:resume' : 'host:pause')}
            disabled={!!host.paused && !host.paused.byHost}
            className="rounded-2xl border-2 border-white/70 py-3 text-xl font-black disabled:opacity-40"
          >
            {host.paused?.byHost ? '▶ Reprendre' : '⏸ Pause'}
          </button>
        )}
        {main && (
          <button
            type="button"
            onClick={() => remote.send(main.event)}
            disabled={main.disabled}
            className="rounded-2xl bg-white py-5 text-3xl font-black text-brand shadow-lg active:scale-95 disabled:opacity-50"
            data-testid="remote-main"
          >
            {main.label}
          </button>
        )}
        <div className="grid grid-cols-3 gap-2">
          <TvButton
            label="🔇 Couper"
            title="Couper le son de la TV"
            onClick={() => remote.tv('mute')}
          />
          <TvButton
            label="🔊 Son"
            title="Remettre le son de la TV"
            onClick={() => remote.tv('unmute')}
          />
          <TvButton
            label="🎶 −"
            title="Baisser la musique de la TV"
            onClick={() => remote.tv('music-down')}
          />
          <TvButton
            label="🎶 +"
            title="Monter la musique de la TV"
            onClick={() => remote.tv('music-up')}
          />
          {question?.audio && (
            <TvButton
              label="↻ Extrait"
              title="Rejouer l'extrait"
              onClick={() => remote.tv('replay')}
            />
          )}
        </div>
        {phase !== 'ENDED' && phase !== null && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Terminer la partie maintenant ?')) remote.send('host:end');
            }}
            className="text-sm font-semibold underline opacity-80"
          >
            Terminer la partie
          </button>
        )}
      </footer>
    </Screen>
  );
}

type Remote = ReturnType<typeof useRemote>;

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-brand text-white select-none">
      {children}
    </main>
  );
}

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl" aria-hidden="true">
        📱
      </p>
      <h1 className="text-3xl font-black">{title}</h1>
      <p className="text-lg opacity-80">{detail}</p>
    </div>
  );
}

function TvButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex-1 rounded-xl bg-white/15 py-2 font-bold active:bg-white/30"
    >
      {label}
    </button>
  );
}

const typeLabel = (type: QuestionType) => QUESTION_TYPES.find((t) => t.type === type)?.label ?? '';

function QuestionPanel({ state }: { state: RemoteState }) {
  const host = state.host;
  const question = currentQuestion(host);
  if (!question) return null;
  return (
    <section className="rounded-2xl bg-white/10 p-4">
      <p className="text-sm font-semibold opacity-75">
        {typeLabel(question.type)}
        {question.buzzer && ' · 🔔 Buzzer'}
      </p>
      <p className="mt-1 text-xl leading-snug font-bold" data-testid="remote-question">
        {question.text}
      </p>
      {(host.phase === 'ANSWERING' || host.phase === 'REVEAL') && !question.buzzer && (
        <p className="mt-3 text-lg font-semibold" data-testid="remote-count">
          {host.answered} / {host.answerTotal} {host.answered > 1 ? 'ont' : 'a'} répondu
        </p>
      )}
    </section>
  );
}

/**
 * « 👁 Voir la réponse »: hidden by default (players may look over the shoulder). Press and hold
 * to peek, or tap to show / hide.
 */
function AnswerPeek({ state }: { state: RemoteState }) {
  const answer = currentAnswer(state);
  const [shown, setShown] = useState(false);
  const press = useRef<{ at: number; was: boolean } | null>(null);
  if (!answer) return null;
  const hasAnswer = answer.answer.length > 0 || !!answer.pin;
  if (!hasAnswer && !answer.explanation) return null;

  return (
    <section className="rounded-2xl bg-gray-950/40 p-4">
      <button
        type="button"
        onPointerDown={() => {
          press.current = { at: Date.now(), was: shown };
          setShown(true);
        }}
        onPointerUp={() => {
          const p = press.current;
          press.current = null;
          // A long press only peeks; a tap toggles.
          setShown(p && Date.now() - p.at > 400 ? false : !p?.was);
        }}
        onPointerCancel={() => setShown(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full rounded-xl bg-white/15 py-3 text-xl font-black"
        data-testid="remote-peek"
      >
        {shown ? '🙈 Cacher la réponse' : '👁 Voir la réponse'}
      </button>
      {shown && (
        <div className="mt-3 flex flex-col gap-2" data-testid="remote-answer">
          {hasAnswer ? (
            <ul className="flex flex-col gap-1 text-xl font-bold">
              {answer.answer.map((line) => (
                <li key={line}>✅ {line}</li>
              ))}
            </ul>
          ) : (
            <p className="opacity-80">Pas de bonne réponse pour ce type de question.</p>
          )}
          {answer.pin && (
            <PinPicture src={answer.pin.imageUrl} className="overflow-hidden rounded-xl">
              <PinZoneMark zone={answer.pin.zone} />
            </PinPicture>
          )}
          {answer.explanation && (
            <p className="rounded-xl bg-white/10 p-3 text-base">💡 {answer.explanation}</p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Reveal (T44): the quiz's answer was set wrong? « ✅ Accepter » a refused choice / typed answer
 * (every group, not only the TV's top 6) or a wider slider margin — the server scores again.
 */
function AcceptPanel({ state, remote }: { state: HostGameState; remote: Remote }) {
  const reveal = state.reveal;
  const question = currentQuestion(state);
  if (!reveal || !question) return null;
  const options = acceptOptions(reveal, question.choices);
  const wider = nextSliderMargin(reveal);
  const unit = reveal.slider?.unit;
  const accept = (input: AcceptInput) => remote.accept(question.index, input);
  if (options.length === 0 && wider === null && reveal.accepted?.margin === undefined) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white/10 p-4" data-testid="accept-panel">
      <div>
        <h2 className="text-lg font-black">Corriger la réponse</h2>
        <p className="text-sm opacity-80">
          Une bonne réponse a été refusée ? Accepte-la : les points sont recalculés.
        </p>
      </div>
      {options.length > 0 && (
        <ul className="flex flex-col gap-2">
          {options.map((o) => (
            <li
              key={o.key}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                o.shape !== undefined ? shapeBg[SHAPES[o.shape]!.color] : 'bg-white/10'
              }`}
            >
              {o.shape !== undefined && (
                <ShapeIcon shape={SHAPES[o.shape]!.shape} className="size-6 shrink-0 fill-white" />
              )}
              <span className="min-w-0 flex-1 font-bold break-words">{o.label}</span>
              <span className="shrink-0 font-semibold tabular-nums opacity-90">× {o.count}</span>
              {o.accepted ? (
                <AcceptedTag big label="✅ Acceptée" />
              ) : o.right ? (
                <span className="shrink-0 px-2 font-black">✓ Bonne</span>
              ) : (
                <AcceptButton big onClick={() => accept(o.input)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {reveal.accepted?.margin !== undefined && (
        <p className="font-bold">
          ✅ Réponses acceptées à ± {formatValue(reveal.accepted.margin, unit)}
        </p>
      )}
      {wider !== null && (
        <AcceptButton
          big
          label={`✅ Accepter les réponses à ± ${formatValue(wider, unit)}`}
          onClick={() => accept({ margin: wider })}
        />
      )}
    </section>
  );
}

function BuzzerPanel({ holder, onJudge }: { holder: LobbyMember; onJudge: (ok: boolean) => void }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl bg-answer-yellow p-4 text-gray-900">
      <div className="flex items-center gap-3">
        <Avatar id={holder.avatar} size="lg" />
        <p className="text-2xl font-black">{holder.nickname} a buzzé !</p>
      </div>
      <div className="flex w-full gap-3">
        <button
          type="button"
          onClick={() => onJudge(true)}
          className="flex-1 rounded-2xl bg-answer-green py-5 text-4xl font-black text-white"
          aria-label="Bonne réponse"
        >
          ✅
        </button>
        <button
          type="button"
          onClick={() => onJudge(false)}
          className="flex-1 rounded-2xl bg-answer-red py-5 text-4xl font-black text-white"
          aria-label="Mauvaise réponse"
        >
          ❌
        </button>
      </div>
    </section>
  );
}

function PausePanel({ state, now, remote }: { state: HostGameState; now: number; remote: Remote }) {
  const paused = state.paused!;
  const count =
    state.resumeAt !== null ? Math.max(1, Math.ceil((state.resumeAt - now) / 1000)) : null;
  const missing = paused.waitingFor;
  return (
    <section className="rounded-2xl bg-gray-950/50 p-4" data-testid="remote-pause">
      <p className="text-xl font-black">
        {count !== null
          ? `Ça reprend dans ${count}…`
          : paused.byHost
            ? "⏸ Pause demandée par l'animateur"
            : '⏸ Partie en pause'}
      </p>
      {paused.hostMissing && <p className="mt-1">En attente de l'écran de la TV…</p>}
      {missing.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {missing.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar id={p.avatar} size="sm" className="grayscale" />
              <span className="flex-1 font-semibold">En attente de {p.nickname}…</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Exclure ${p.nickname} de la partie ?`)) remote.kick(p.id);
                }}
                className="rounded-lg border border-white/60 px-3 py-1 text-sm font-bold"
              >
                Exclure
              </button>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && !paused.byHost && count === null && (
        <button
          type="button"
          onClick={() => remote.send('host:resume')}
          className="mt-3 w-full rounded-xl bg-white py-3 text-lg font-black text-brand"
        >
          Continuer sans {nicknameList(missing)}
        </button>
      )}
    </section>
  );
}

function LobbyPanel({ state, remote }: { state: HostGameState; remote: Remote }) {
  const [selected, setSelected] = useState<string | null>(null);
  const teamMode = state.mode === 'teams';
  const teamIds = state.teams.map((t) => t.id);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">
          {state.players.length} joueur{state.players.length > 1 ? 's' : ''}
        </h2>
        {teamMode && (
          <button
            type="button"
            onClick={() => remote.send('host:shuffle')}
            className="rounded-xl bg-white/15 px-4 py-2 font-bold"
          >
            🔀 Mélanger
          </button>
        )}
      </div>
      {state.players.length === 0 && (
        <p className="opacity-80">En attente des joueurs… Le PIN et le QR code sont sur la TV.</p>
      )}
      <ul className="flex flex-col gap-2">
        {state.players.map((p) => (
          <li key={p.id} className="rounded-xl bg-white/10">
            <button
              type="button"
              onClick={() => setSelected(selected === p.id ? null : p.id)}
              className="flex w-full items-center gap-3 p-2 text-left"
            >
              <Avatar id={p.avatar} size="md" />
              <span className="flex-1 text-lg font-bold">{p.nickname}</span>
              {teamMode && (
                <span
                  className={`rounded px-2 py-0.5 text-sm font-bold ${
                    p.teamId !== undefined ? TEAM_BG[p.teamId] : 'bg-white/20'
                  }`}
                >
                  {p.teamId !== undefined ? TEAM_NAMES[p.teamId] : 'Sans équipe'}
                </span>
              )}
            </button>
            {selected === p.id && (
              <div className="flex flex-wrap gap-2 px-2 pb-2">
                {teamMode &&
                  teamIds
                    .filter((id) => id !== p.teamId)
                    .map((id: TeamId) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          remote.movePlayer(p.id, id);
                          setSelected(null);
                        }}
                        className={`rounded-lg px-3 py-2 text-sm font-bold ${TEAM_BG[id]}`}
                      >
                        → {TEAM_NAMES[id]}
                      </button>
                    ))}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Exclure ${p.nickname} de la partie ?`)) remote.kick(p.id);
                    setSelected(null);
                  }}
                  className="rounded-lg border border-white/60 px-3 py-2 text-sm font-bold"
                >
                  Exclure
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Standings({
  title,
  top,
}: {
  title: string;
  top: { nickname: string; avatar: string; score: number; gained?: number }[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-black">{title}</h2>
      <ol className="flex flex-col gap-2">
        {top.map((p, i) => (
          <li key={p.nickname} className="flex items-center gap-3 rounded-xl bg-white/10 p-2">
            <span className="w-6 text-center text-lg font-black">{i + 1}</span>
            <Avatar id={p.avatar} size="sm" />
            <span className="flex-1 font-bold">{p.nickname}</span>
            {p.gained !== undefined && <GainBadge gained={p.gained} instant />}
            <span className="font-black tabular-nums">{p.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
