import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { PlayerResultPayload, WagerPrompt } from '@lbq/shared';
import { formatValue } from '../lib/numbers';
import { isOuterSlot, parseGuess, slotLabel } from '../lib/wager';
import { editWagerGuess, sendAnswer, sendWagerGuess } from './playerStore';
import { wagerGuessed, type PlayerState } from './playerState';

/** « Paris sur les réponses » (T61), stage 1: type a number (can be changed until the bets). */
export function WagerGuess({ unit }: { unit?: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const value = parseGuess(text);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (value === null || busy) return;
        setBusy(true);
        const err = await sendWagerGuess(value);
        setBusy(false);
        setError(err);
      }}
      className="flex flex-1 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <h2 className="text-center text-2xl font-black">🎲 Ton estimation</h2>
      <p className="-mt-2 text-center font-semibold opacity-85">
        Un nombre (la question est sur l’écran). Ensuite, tout le monde pariera sur la meilleure
        estimation !
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Changer le signe"
          onClick={() => setText((t) => (t.trim().startsWith('-') ? t.trim().slice(1) : `-${t}`))}
          className="touch-manipulation rounded-2xl bg-white/20 px-4 py-4 text-2xl font-black"
        >
          ±
        </button>
        <input
          ref={input}
          value={text}
          inputMode="decimal"
          maxLength={20}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="Ton nombre…"
          aria-label="Ton estimation"
          autoComplete="off"
          enterKeyHint="send"
          className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-4 text-center text-3xl font-black text-brand tabular-nums outline-none placeholder:text-brand/40"
        />
        {unit && <span className="shrink-0 text-2xl font-black">{unit}</span>}
      </div>
      {text.trim() !== '' && value === null && (
        <p className="text-center font-bold opacity-85">Ce n’est pas un nombre</p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-answer-red px-3 py-2 text-center font-black">
          {error}
        </p>
      )}
      <motion.button
        type="submit"
        disabled={value === null || busy}
        whileTap={{ scale: 0.95 }}
        className="touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Valider
      </motion.button>
    </form>
  );
}

/**
 * Stage 2: every slot, smallest first (« Plus petit que tout » on top); one tap = the bet
 * (final). One's own guess can be chosen.
 */
export function WagerBet({ prompt }: { prompt: Extract<WagerPrompt, { stage: 'bet' }> }) {
  const count = prompt.slots.length;
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">💰 Ton pari</h2>
      <p className="-mt-1 text-center text-sm font-semibold opacity-85">
        La plus proche de la bonne réponse <strong>sans la dépasser</strong>
      </p>
      {prompt.slots.map((value, i) => {
        const own = prompt.own === i;
        const outer = isOuterSlot(i, count);
        return (
          <motion.button
            key={i}
            type="button"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => sendAnswer({ choiceIndex: i })}
            aria-label={`Parier sur ${slotLabel(value, prompt.unit)}`}
            className={`flex max-h-24 min-h-14 flex-1 touch-manipulation items-center gap-3 rounded-2xl bg-white px-4 py-2 text-left font-black text-brand shadow-[inset_0_-5px_0_rgba(0,0,0,0.2)] ${
              value === null ? 'text-lg' : 'text-2xl tabular-nums'
            }`}
          >
            <span className="min-w-0 flex-1 break-words">{slotLabel(value, prompt.unit)}</span>
            {own && (
              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
                Toi
              </span>
            )}
            {outer && (
              <span className="shrink-0 rounded-full bg-answer-yellow px-2 py-0.5 text-sm text-black">
                ×1,5
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/** « Réponse envoyée ! » of a « Paris sur les réponses »: the guess (can be changed) or the bet. */
export function WagerAnswered({ s }: { s: PlayerState }) {
  const prompt = s.prompt?.wager;
  if (prompt?.stage === 'bet') {
    const bet = s.myAnswer && 'choiceIndex' in s.myAnswer ? s.myAnswer.choiceIndex : null;
    return (
      <Box title="Pari enregistré !" subtitle="On attend les autres…">
        {bet !== null && prompt.slots[bet] !== undefined && (
          <p className="rounded-2xl bg-white px-6 py-4 text-2xl font-black text-brand tabular-nums">
            {slotLabel(prompt.slots[bet]!, prompt.unit)}
          </p>
        )}
      </Box>
    );
  }
  const guess = wagerGuessed(s);
  return (
    <Box title="Estimation enregistrée !" subtitle="On attend les estimations des autres…">
      {guess !== null && (
        <motion.p
          initial={{ scale: 1.4, rotate: -6 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 12 }}
          className="max-w-full break-words rounded-2xl bg-white px-6 py-4 text-3xl font-black text-brand tabular-nums"
          data-testid="wager-guess"
        >
          {formatValue(guess, prompt?.unit)}
        </motion.p>
      )}
      <button
        type="button"
        onClick={editWagerGuess}
        className="font-bold underline underline-offset-4"
      >
        Changer mon estimation
      </button>
    </Box>
  );
}

/** Result lines: the right answer, the player's guess and bet, the winning guess bonus. */
export function WagerResultLines({ wager }: { wager: NonNullable<PlayerResultPayload['wager']> }) {
  const unit = wager.unit;
  return (
    <div className="flex flex-col items-center gap-2 font-bold" data-testid="wager-result">
      <p>
        Bonne réponse :{' '}
        <span className="rounded bg-black/25 px-2 tabular-nums">
          {formatValue(wager.correct, unit)}
        </span>
      </p>
      <p>Estimation gagnante : {slotLabel(wager.winning, unit)}</p>
      {(wager.guess !== undefined || wager.bet !== undefined) && (
        <p className="opacity-90">
          {wager.guess !== undefined && <>Ton estimation : {formatValue(wager.guess, unit)}</>}
          {wager.guess !== undefined && wager.bet !== undefined && ' · '}
          {wager.bet !== undefined && <>Ton pari : {slotLabel(wager.bet, unit)}</>}
        </p>
      )}
      {wager.author && (
        <motion.p
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-black/25 px-4 py-2 text-xl font-black"
        >
          🎯 Ton estimation est la gagnante : + {wager.authorPoints} pts
        </motion.p>
      )}
    </div>
  );
}

function Box({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h2 className="text-3xl font-black leading-tight">{title}</h2>
      <p className="text-lg font-semibold opacity-85">{subtitle}</p>
      {children}
    </div>
  );
}
