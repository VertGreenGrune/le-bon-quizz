import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerResultPayload } from '@lbq/shared';
import type { PlayerState } from './playerState';
import { sendListGuess } from './playerStore';

/**
 * « Liste chrono » (T57): type as many items of the list as possible before the end of the time.
 * Each guess comes back as `found` (added to the list below), `already` or `wrong`.
 */
export function ListPad({ s }: { s: PlayerState }) {
  const list = s.prompt!.list!;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'found' | 'other'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const guess = text.trim();
  const complete = list.found.length >= list.total;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!guess || busy || complete) return;
        setBusy(true);
        const res = await sendListGuess(guess);
        setBusy(false);
        setText('');
        input.current?.focus();
        if ('error' in res) return setFeedback({ kind: 'other', text: res.error });
        setFeedback(
          res.result === 'found'
            ? { kind: 'found', text: `✅ ${res.item!.text} !` }
            : res.result === 'already'
              ? { kind: 'other', text: `Déjà trouvé : ${res.item!.text}` }
              : { kind: 'other', text: `Non, pas « ${guess} »…` },
        );
      }}
      className="flex min-h-0 flex-1 flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <p className="text-center text-lg font-bold">
        📝 Cite un maximum de réponses — regarde l’écran !
      </p>
      <p className="text-center text-4xl font-black tabular-nums" data-testid="list-count">
        {list.found.length} / {list.total}
      </p>
      {complete ? (
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl bg-answer-green px-4 py-4 text-center text-2xl font-black"
        >
          🏆 Liste complète ! On attend les autres…
        </motion.p>
      ) : (
        <div className="flex gap-2">
          <input
            ref={input}
            value={text}
            maxLength={list.maxLength}
            onChange={(e) => setText(e.target.value)}
            placeholder="Une réponse…"
            aria-label="Une réponse"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-center text-2xl font-black text-brand outline-none placeholder:text-brand/40"
          />
          <motion.button
            type="submit"
            disabled={!guess || busy}
            whileTap={{ scale: 0.95 }}
            className="touch-manipulation rounded-2xl bg-answer-green px-4 text-xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
          >
            OK
          </motion.button>
        </div>
      )}
      {feedback && (
        <motion.p
          key={feedback.text + list.found.length}
          role="status"
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: feedback.kind === 'other' ? [0, -8, 8, 0] : 0 }}
          className={`rounded-xl px-3 py-2 text-center text-xl font-black ${feedback.kind === 'found' ? 'bg-answer-green' : 'bg-answer-red'}`}
          data-testid="list-feedback"
        >
          {feedback.text}
        </motion.p>
      )}
      <ul
        className="flex min-h-0 flex-wrap content-start gap-2 overflow-y-auto"
        data-testid="list-found"
      >
        {[...list.found].reverse().map((item) => (
          <motion.li
            key={item.index}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-full bg-white/20 px-3 py-1 font-bold"
          >
            {item.text}
          </motion.li>
        ))}
      </ul>
    </form>
  );
}

export function listResultTitle(r: PlayerResultPayload): string {
  const list = r.list!;
  if (list.found >= list.total) return 'Liste complète !';
  if (r.correct) return 'Bien joué !';
  return list.found > 0 ? 'Presque !' : 'Raté !';
}

/** Result screen: « 5 / 7 trouvés » and what was missed. */
export function ListResultLines({ list }: { list: NonNullable<PlayerResultPayload['list']> }) {
  return (
    <>
      <p className="text-xl font-black">
        {list.found} / {list.total} trouvé{list.found > 1 ? 's' : ''}
      </p>
      {list.missed.length > 0 && (
        <p className="font-bold">Il manquait : {list.missed.join(', ')}</p>
      )}
    </>
  );
}
