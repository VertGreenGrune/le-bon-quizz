import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  WAVELENGTH_CLUE_MAX_LENGTH,
  WAVELENGTH_SCALE,
  type PlayerResultPayload,
  type WavelengthPrompt,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { WavelengthScale } from '../components/WavelengthScale';
import { sendAnswer, sendWavelengthClue } from './playerStore';

/**
 * « Sur la même longueur d'onde » (T62) on a phone. The psychic sees the target zone and types
 * the clue; the others wait, then move a needle on the scale.
 */
export function WavelengthAnswer({
  prompt,
  initial,
}: {
  prompt: WavelengthPrompt;
  /** After « Annuler ma réponse »: the needle just cancelled. */
  initial?: number;
}) {
  const psychic = prompt.target !== undefined;
  if (prompt.stage === 'clue')
    return psychic ? <ClueWriter prompt={prompt} /> : <WaitForClue prompt={prompt} />;
  return psychic ? <PsychicWaits prompt={prompt} /> : <Needle prompt={prompt} initial={initial} />;
}

const screen =
  'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]';

/** The psychic, stage 1: the target zone and the clue field. */
function ClueWriter({ prompt }: { prompt: WavelengthPrompt }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        const err = await sendWavelengthClue(text);
        setBusy(false);
        setError(err);
      }}
      className={screen}
      data-testid="wavelength-clue-form"
    >
      <h2 className="text-center text-2xl font-black">🔮 Toi seul vois la cible !</h2>
      <p className="-mt-2 text-center font-semibold opacity-85">
        Donne un indice pour que les autres placent l’aiguille au bon endroit.
      </p>
      <WavelengthScale spectrum={prompt.spectrum} target={prompt.target} size="phone" hideTarget />
      <input
        ref={input}
        value={text}
        maxLength={prompt.stage === 'clue' ? prompt.maxLength : WAVELENGTH_CLUE_MAX_LENGTH}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="Ton indice…"
        aria-label="Ton indice"
        autoComplete="off"
        enterKeyHint="send"
        className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-black text-brand outline-none placeholder:text-brand/40"
      />
      <p className="-mt-2 text-center text-sm font-semibold opacity-80">
        Un seul indice, sans les mots « {prompt.spectrum.left} » ni « {prompt.spectrum.right} ».
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-answer-red px-3 py-2 text-center font-black">
          {error}
        </p>
      )}
      <motion.button
        type="submit"
        disabled={!text.trim() || busy}
        whileTap={{ scale: 0.95 }}
        className="touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Envoyer l’indice
      </motion.button>
    </form>
  );
}

/** The others, stage 1: who is looking for a clue. */
function WaitForClue({ prompt }: { prompt: WavelengthPrompt }) {
  return (
    <div className={`${screen} items-center justify-center text-center`}>
      {prompt.psychic && <Avatar id={prompt.psychic.avatar} size="xl" />}
      <h2 className="text-3xl font-black">
        🔮 {prompt.psychic?.nickname ?? 'Le médium'} cherche un indice…
      </h2>
      <p className="text-lg font-semibold opacity-85">Prépare-toi à placer l’aiguille !</p>
      <WavelengthScale spectrum={prompt.spectrum} size="phone" />
    </div>
  );
}

/** The psychic, stage 2: the others guess. */
function PsychicWaits({ prompt }: { prompt: WavelengthPrompt }) {
  return (
    <div className={`${screen} items-center justify-center text-center`}>
      <h2 className="text-3xl font-black">Les autres cherchent…</h2>
      {prompt.stage === 'guess' && (
        <p className="rounded-2xl bg-white px-5 py-3 text-2xl font-black break-words text-brand">
          « {prompt.clue} »
        </p>
      )}
      <WavelengthScale spectrum={prompt.spectrum} target={prompt.target} size="phone" hideTarget />
      <p className="font-semibold opacity-85">
        Tu gagnes la moyenne de leurs points : croise les doigts !
      </p>
    </div>
  );
}

/** A guesser, stage 2: the clue and the needle. */
function Needle({ prompt, initial }: { prompt: WavelengthPrompt; initial?: number }) {
  const [value, setValue] = useState(initial ?? WAVELENGTH_SCALE / 2);
  const nudge = (d: 1 | -1) => setValue((v) => Math.min(WAVELENGTH_SCALE, Math.max(0, v + d)));
  const nudgeClass =
    'flex size-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/20 text-3xl font-black active:bg-white/40';
  return (
    <div className={screen} data-testid="wavelength-needle-form">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="flex items-center gap-2 font-bold opacity-90">
          {prompt.psychic && <Avatar id={prompt.psychic.avatar} size="xs" />}
          L’indice de {prompt.psychic?.nickname ?? 'du médium'} :
        </span>
        <span
          className="max-w-full rounded-2xl bg-white px-5 py-3 text-2xl font-black break-words text-brand"
          data-testid="wavelength-phone-clue"
        >
          « {prompt.stage === 'guess' ? prompt.clue : ''} »
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-4">
        <WavelengthScale spectrum={prompt.spectrum} value={value} size="phone" />
        <div className="flex w-full items-center gap-3">
          <button
            type="button"
            aria-label="Vers la gauche"
            onClick={() => nudge(-1)}
            className={nudgeClass}
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={WAVELENGTH_SCALE}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            aria-label="Ton aiguille"
            className="slider-big min-w-0 flex-1"
          />
          <button
            type="button"
            aria-label="Vers la droite"
            onClick={() => nudge(1)}
            className={nudgeClass}
          >
            +
          </button>
        </div>
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

/** « Réponse envoyée ! »: the needle on the scale. */
export function WavelengthAnswered({ prompt, value }: { prompt: WavelengthPrompt; value: number }) {
  return (
    <div className="w-full">
      <WavelengthScale spectrum={prompt.spectrum} value={value} size="phone" />
    </div>
  );
}

/** Result: the target, the needle, what the psychic did. */
export function WavelengthResultLines({
  wavelength,
}: {
  wavelength: NonNullable<PlayerResultPayload['wavelength']>;
}) {
  const w = wavelength;
  return (
    <div className="flex w-full flex-col items-center gap-3" data-testid="wavelength-result">
      {w.clue !== null && (
        <p className="font-semibold">
          {w.psychic ? 'Ton indice' : `L’indice de ${w.psychicName ?? 'du médium'}`} :{' '}
          <strong>« {w.clue} »</strong>
        </p>
      )}
      <WavelengthScale spectrum={w.spectrum} target={w.target} value={w.yours} size="phone" />
      {w.yours !== undefined && (
        <p className="font-semibold">
          Ton aiguille : <strong className="tabular-nums">{w.yours}</strong> · la cible :{' '}
          <strong className="tabular-nums">{w.target}</strong>
        </p>
      )}
      {w.psychic && w.clue !== null && (
        <p className="font-semibold">🔮 Tu gagnes la moyenne des points des autres.</p>
      )}
    </div>
  );
}
