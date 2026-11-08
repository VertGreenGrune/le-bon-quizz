import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../themes';
import {
  setAmbiance,
  setLevels,
  setMuted,
  useAmbiance,
  useMuted,
  useRadioFailed,
  useSoundLevels,
  type Ambiance,
  type SoundLevels,
} from './sounds';

/**
 * « 🔊 Son » in the TV header (T41): two volumes — « Musique et effets » (lobby music, ticks,
 * reveal, podium, jokers…) and « Extraits du quiz » (the question's sound clip, blind tests) — and
 * « Tout couper ». Remembered in `localStorage` by `sounds.ts`. Plus the background music:
 * the theme's radio (`radio.ts`) or the game's own lobby music.
 */
export function SoundButton() {
  const muted = useMuted();
  const levels = useSoundLevels();
  const ambiance = useAmbiance();
  const radioFailed = useRadioFailed();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const silent = muted || (levels.music === 0 && levels.clips === 0);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Réglages du son"
        title="Réglages du son"
        className="rounded-lg border-2 border-white/60 px-3 py-1 text-xl hover:bg-white/10"
      >
        {silent ? '🔇' : '🔊'} <span className="text-base">Son</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Réglages du son"
          className="absolute top-full right-0 z-40 mt-2 flex w-80 flex-col gap-4 rounded-xl bg-brand p-4 text-base shadow-2xl ring-2 ring-white/30"
        >
          <fieldset className={`flex flex-col gap-1 ${muted ? 'opacity-50' : ''}`}>
            <legend className="mb-1 font-semibold">📻 Musique d’ambiance</legend>
            <AmbianceChoice
              value="radio"
              current={ambiance}
              disabled={muted}
              label={`Radio du thème : ${theme.radio.name}`}
            />
            {ambiance === 'radio' && radioFailed && (
              <span className="text-sm text-yellow-200" role="status">
                Radio injoignable : musique du jeu à la place.
              </span>
            )}
            <AmbianceChoice
              value="game"
              current={ambiance}
              disabled={muted}
              label="Musique du jeu (salon seulement)"
            />
            <span className="text-sm opacity-70">
              La radio se coupe pendant les questions à écouter. Radio gratuite SomaFM.
            </span>
          </fieldset>
          <LevelSlider
            label="🎶 Musique et effets"
            hint="Radio, musique du salon, tic-tac, révélation, podium"
            level="music"
            levels={levels}
            disabled={muted}
          />
          <LevelSlider
            label="🎵 Extraits du quiz"
            hint="Le son des questions (blind tests)"
            level="clips"
            levels={levels}
            disabled={muted}
          />
          <label className="flex items-center gap-3 font-semibold">
            <input
              type="checkbox"
              checked={muted}
              onChange={(e) => setMuted(e.target.checked)}
              className="size-5 accent-white"
            />
            🔇 Tout couper
          </label>
        </div>
      )}
    </div>
  );
}

function LevelSlider({
  label,
  hint,
  level,
  levels,
  disabled,
}: {
  label: string;
  hint: string;
  level: keyof SoundLevels;
  levels: SoundLevels;
  disabled: boolean;
}) {
  const percent = Math.round(levels[level] * 100);
  return (
    <label className={`flex flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex items-baseline justify-between font-semibold">
        {label}
        <span className="tabular-nums">{percent} %</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        disabled={disabled}
        onChange={(e) => setLevels({ [level]: Number(e.target.value) / 100 })}
        className="w-full accent-white"
        data-testid={`volume-${level}`}
      />
      <span className="text-sm opacity-70">{hint}</span>
    </label>
  );
}

function AmbianceChoice({
  value,
  current,
  disabled,
  label,
}: {
  value: Ambiance;
  current: Ambiance;
  disabled: boolean;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="radio"
        name="ambiance"
        value={value}
        checked={current === value}
        disabled={disabled}
        onChange={() => setAmbiance(value)}
        className="size-5 accent-white"
        data-testid={`ambiance-${value}`}
      />
      {label}
    </label>
  );
}
