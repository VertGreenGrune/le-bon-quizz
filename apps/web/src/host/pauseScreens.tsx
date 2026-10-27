import { AnimatePresence, motion } from 'framer-motion';
import { PAUSE_HINT_MS, type LobbyMember } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { COMEBACK_MS, type HostGameState } from './hostReducer';

/** "0:42" */
function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** "Bob", "Bob et Zoé", "Bob, Zoé et Léa" */
export function nicknameList(members: Pick<LobbyMember, 'nickname'>[]): string {
  const names = members.map((m) => m.nickname);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
}

/**
 * Over the question while the game is paused: who it waits for (and since when), « Continuer
 * sans… » (highlighted after PAUSE_HINT_MS) and « Exclure », then the 3-2-1 countdown. A pause
 * asked by the host (« ⏸ Pause », TV or remote) shows « ▶ Reprendre » first.
 */
export function PauseOverlay({
  state,
  now,
  onResume,
  onKick,
}: {
  state: HostGameState;
  now: number;
  onResume: () => void;
  onKick: (playerId: string) => void;
}) {
  const paused = state.paused!;
  const waitedMs = state.pausedSince !== null ? now - state.pausedSince : 0;
  const count =
    state.resumeAt !== null ? Math.max(1, Math.ceil((state.resumeAt - now) / 1000)) : null;
  const missing = paused.waitingFor;
  const hint = waitedMs >= PAUSE_HINT_MS;

  return (
    <motion.div
      role="dialog"
      aria-label="Partie en pause"
      data-testid="host-pause"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col items-center justify-center gap-8 bg-gray-950/85 p-8 text-center"
    >
      {count !== null ? (
        <>
          <p className="text-4xl font-black">Tout le monde est là, ça reprend !</p>
          <motion.p
            key={count}
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[12rem] leading-none font-black tabular-nums"
          >
            {count}
          </motion.p>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-6xl font-black">
              {paused.byHost ? "⏸ Pause demandée par l'animateur" : '⏸ Partie en pause'}
            </h2>
            <p className="mt-3 text-2xl opacity-80">
              Le chrono est arrêté depuis {formatDuration(waitedMs)} — personne ne perd de points.
            </p>
          </div>
          <ul className="flex w-full max-w-3xl flex-col gap-3">
            {paused.hostMissing && (
              <li className="rounded-2xl bg-white/10 px-6 py-4 text-2xl font-bold">
                En attente de l'écran de l'animateur…
              </li>
            )}
            {missing.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 rounded-2xl bg-white/10 px-6 py-4 text-left"
              >
                <Avatar id={p.avatar} size="lg" className="grayscale" />
                <span className="flex-1 text-3xl font-bold">
                  En attente de {p.nickname}…
                  <span className="block text-lg font-semibold opacity-70">
                    Il ou elle peut revenir sur la même page, ou rejoindre avec le même pseudo.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Exclure ${p.nickname} de la partie ?`)) onKick(p.id);
                  }}
                  className="rounded-xl border-2 border-white/60 px-5 py-3 text-xl font-bold hover:bg-white/10"
                >
                  Exclure
                </button>
              </li>
            ))}
          </ul>
          {paused.byHost && (
            <button
              type="button"
              onClick={onResume}
              className="rounded-xl bg-white px-10 py-4 text-2xl font-black text-brand shadow-lg"
            >
              ▶ Reprendre
            </button>
          )}
          {/* After « ▶ Reprendre »: the usual « Continuer sans… » (the same host:resume). */}
          {missing.length > 0 && !paused.byHost && (
            <motion.button
              type="button"
              onClick={onResume}
              animate={hint ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={hint ? { duration: 1.2, repeat: Infinity } : undefined}
              className={`rounded-xl px-10 py-4 text-2xl font-black shadow-lg ${
                hint ? 'bg-answer-yellow text-gray-900' : 'bg-white text-brand'
              }`}
            >
              Continuer sans {nicknameList(missing)}
            </motion.button>
          )}
        </>
      )}
    </motion.div>
  );
}

/** « <pseudo> est de retour ! » flashes, top of the screen. */
export function ComebackToasts({ state, now }: { state: HostGameState; now: number }) {
  const recent = state.comebacks.filter((c) => now - c.at < COMEBACK_MS);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2">
      <AnimatePresence>
        {recent.map((c) => (
          <motion.p
            key={`${c.id}-${c.at}`}
            role="status"
            initial={{ y: -30, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-full bg-answer-green px-6 py-2 text-2xl font-black shadow-xl"
          >
            <Avatar id={c.avatar} size="sm" />
            {c.nickname} est de retour !
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
