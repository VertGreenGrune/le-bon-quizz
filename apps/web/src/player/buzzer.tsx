import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerResultPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { buzzerView, type PlayerState } from './playerState';
import { sendBuzz } from './playerStore';

/**
 * « Buzzer » question on the phone: one huge BUZZ button instead of the answer screen. The first
 * player the server hears has the hand and answers out loud; the host judges on the TV.
 */
export function BuzzerPad({ s }: { s: PlayerState }) {
  const view = buzzerView(s);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const holder = s.buzzer?.holder;

  if (view === 'mine')
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-6 bg-answer-yellow p-6 text-center text-black"
        data-testid="buzzer-mine"
      >
        <motion.p
          animate={{ rotate: [-12, 12, -12], scale: [1, 1.1, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
          className="text-8xl"
          aria-hidden="true"
        >
          🔔
        </motion.p>
        <h2 className="text-5xl font-black">À toi !</h2>
        <p className="text-2xl font-bold">Réponds à voix haute, l’animateur valide.</p>
      </div>
    );
  if (view === 'out')
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-8xl" aria-hidden="true">
          ❌
        </p>
        <h2 className="text-4xl font-black">Raté !</h2>
        <p className="text-xl font-semibold opacity-90">
          Tu ne peux plus buzzer sur cette question.
        </p>
      </div>
    );

  const taken = view === 'taken';
  const buzz = () => {
    if (taken || sending.current) return;
    sending.current = true;
    void sendBuzz().then((message) => {
      sending.current = false;
      setError(message);
    });
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      {taken && holder ? (
        <p className="flex items-center gap-3 text-2xl font-black" data-testid="buzzer-taken">
          <Avatar id={holder.avatar} size="md" />
          {holder.nickname} a la main…
        </p>
      ) : (
        <p className="text-2xl font-black">Tu connais la réponse ?</p>
      )}
      <motion.button
        type="button"
        disabled={taken}
        whileTap={taken ? undefined : { scale: 0.88 }}
        onPointerDown={(e) => {
          // Fire on touch-down: the fastest one wins.
          e.preventDefault();
          buzz();
        }}
        onClick={buzz}
        aria-label="BUZZ"
        className="aspect-square w-full max-w-80 touch-manipulation rounded-full bg-answer-red text-6xl font-black shadow-[inset_0_-14px_0_rgba(0,0,0,0.3),0_10px_30px_rgba(0,0,0,0.35)] ring-8 ring-white/80 active:brightness-90 disabled:opacity-40"
      >
        BUZZ
      </motion.button>
      {error && !taken && (
        <p className="rounded-xl bg-black/30 px-4 py-2 font-bold" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Title of the phone's result screen after a « Buzzer » question. */
export function buzzerResultTitle(b: NonNullable<PlayerResultPayload['buzzer']>): string {
  if (b.won) return 'Bien joué !';
  if (b.wrong) return 'Raté !';
  return b.winner ? `${b.winner.nickname} a été plus rapide` : 'Personne n’a trouvé';
}
