import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { BluffPrompt, PlayerResultPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { editLie, sendAnswer, sendLie } from './playerStore';
import type { PlayerState } from './playerState';

/** Option letters, the same as on the TV. */
export const optionLetter = (i: number) => String.fromCharCode(65 + i);

/** « Mytho ! », stage 1: write a believable fake answer. */
export function BluffWrite({ maxLength }: { maxLength: number }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const lie = text.trim();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!lie || busy) return;
        setBusy(true);
        const err = await sendLie(lie);
        setBusy(false);
        setError(err);
      }}
      className="flex flex-1 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <h2 className="text-center text-2xl font-black">🤥 Invente un mytho</h2>
      <p className="-mt-2 text-center font-semibold opacity-85">
        Une fausse réponse assez crédible pour piéger les autres (la question est sur l’écran).
      </p>
      <input
        ref={input}
        value={text}
        maxLength={maxLength}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="Ton mytho…"
        aria-label="Ton mytho"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-black text-brand outline-none placeholder:text-brand/40"
      />
      {error && (
        <p role="alert" className="rounded-xl bg-answer-red px-3 py-2 text-center font-black">
          {error}
        </p>
      )}
      <motion.button
        type="submit"
        disabled={!lie || busy}
        whileTap={{ scale: 0.95 }}
        className="touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Valider
      </motion.button>
    </form>
  );
}

/**
 * « Mytho ! », stage 2: every option (same letters as the TV); one's own lie can't be chosen,
 * the 50/50 hides some lies.
 */
export function BluffVote({
  prompt,
  hidden,
}: {
  prompt: Extract<BluffPrompt, { stage: 'vote' }>;
  hidden: number[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">Laquelle est vraie ?</h2>
      {prompt.options.map((text, i) => {
        const own = prompt.own === i;
        const gone = hidden.includes(i);
        return (
          <motion.button
            key={i}
            type="button"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            whileTap={own || gone ? undefined : { scale: 0.95 }}
            disabled={own || gone}
            onClick={() => sendAnswer({ choiceIndex: i })}
            aria-label={`Réponse ${optionLetter(i)} : ${text}`}
            className={`flex min-h-14 flex-1 touch-manipulation items-center gap-3 rounded-2xl px-4 py-2 text-left text-xl font-black shadow-[inset_0_-5px_0_rgba(0,0,0,0.2)] ${
              own
                ? 'bg-white/10 opacity-60'
                : gone
                  ? 'bg-black/20 opacity-25'
                  : 'bg-white text-brand'
            }`}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              {optionLetter(i)}
            </span>
            <span className="min-w-0 flex-1 break-words">{text}</span>
            {own && <span className="shrink-0 text-sm">Ton mytho</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

/** « Réponse envoyée ! » of a « Mytho ! »: the lie (can still be changed) or the vote. */
export function BluffAnswered({ s }: { s: PlayerState }) {
  const prompt = s.prompt?.bluff;
  const vote = s.myAnswer && 'choiceIndex' in s.myAnswer ? s.myAnswer.choiceIndex : null;
  if (prompt?.stage === 'vote') {
    return (
      <Box title="Vote enregistré !" subtitle="On attend les autres…">
        {vote !== null && (
          <p className="rounded-2xl bg-white px-6 py-4 text-2xl font-black text-brand">
            {optionLetter(vote)} · {prompt.options[vote]}
          </p>
        )}
      </Box>
    );
  }
  return (
    <Box title="Mytho enregistré !" subtitle="On attend les mythos des autres…">
      <motion.p
        initial={{ scale: 1.4, rotate: -6 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 12 }}
        className="max-w-full break-words rounded-2xl bg-white px-6 py-4 text-3xl font-black text-brand"
      >
        « {s.lie?.text} »
      </motion.p>
      <button type="button" onClick={editLie} className="font-bold underline underline-offset-4">
        Changer mon mytho
      </button>
    </Box>
  );
}

/** Result screen lines: the truth, who you fooled, who fooled you. */
export function BluffResultLines({ bluff }: { bluff: NonNullable<PlayerResultPayload['bluff']> }) {
  const names = (list: { nickname: string }[]) => list.map((p) => p.nickname).join(', ');
  return (
    <div className="flex flex-col items-center gap-2 font-bold" data-testid="bluff-result">
      <p>
        La vérité : <span className="rounded bg-black/25 px-2">{bluff.truth}</span>
      </p>
      {bluff.fellFor && bluff.fellFor.length > 0 && (
        <p>😵 Piégé par le mytho de {names(bluff.fellFor)}</p>
      )}
      {bluff.lie && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center gap-1 rounded-2xl bg-black/25 px-4 py-2"
        >
          <span>Ton mytho « {bluff.lie} »</span>
          {bluff.fooled.length > 0 ? (
            <>
              <span>
                🤥 a piégé {bluff.fooled.length} joueur{bluff.fooled.length > 1 ? 's' : ''} : +{' '}
                {bluff.fooledPoints} pts
              </span>
              <span className="flex gap-1">
                {bluff.fooled.map((p) => (
                  <Avatar key={p.id} id={p.avatar} size="sm" />
                ))}
              </span>
            </>
          ) : (
            <span className="opacity-80">n’a piégé personne</span>
          )}
        </motion.div>
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
