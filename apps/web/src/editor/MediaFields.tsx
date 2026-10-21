import { useEffect, useRef, useState } from 'react';
import {
  AUDIO_DEFAULT_DURATION_SEC,
  AUDIO_MAX_DURATION_SEC,
  AUDIO_MIN_DURATION_SEC,
  type ImageEffect,
  type QuestionAudio,
} from '@lbq/shared';
import { api } from '../api';
import { RevealImage } from '../components/RevealImage';
import { ACCEPTED_AUDIO, checkAudioFile } from './imageFile';

const EFFECTS: { value: ImageEffect; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'blur', label: 'Flou' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'pixelate', label: 'Pixelisé' },
];

/** Preview loop: the picture clears up in PREVIEW_MS, then stays clear PREVIEW_HOLD_MS. */
const PREVIEW_MS = 4000;
const PREVIEW_HOLD_MS = 1200;

const DURATIONS = Array.from(
  { length: (AUDIO_MAX_DURATION_SEC - AUDIO_MIN_DURATION_SEC) / 5 + 1 },
  (_, i) => AUDIO_MIN_DURATION_SEC + i * 5,
);

/** « Effet sur l'image » (Aucun / Flou / Zoom / Pixelisé) with a looping live preview. */
export function ImageEffectField({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: ImageEffect;
  onChange: (effect: ImageEffect) => void;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (value === 'none') return;
    const start = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - start) % (PREVIEW_MS + PREVIEW_HOLD_MS);
      setProgress(Math.min(1, t / PREVIEW_MS));
    }, 80);
    return () => clearInterval(id);
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <span id="effect-label" className="text-sm font-bold text-gray-600">
        Effet sur l'image
      </span>
      <div
        role="radiogroup"
        aria-labelledby="effect-label"
        className="flex flex-wrap gap-1 self-start rounded-lg bg-gray-100 p-1"
      >
        {EFFECTS.map((e) => (
          <button
            key={e.value}
            type="button"
            role="radio"
            aria-checked={value === e.value}
            onClick={() => onChange(e.value)}
            className={`rounded-md px-3 py-1 text-sm font-bold ${value === e.value ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}
          >
            {e.label}
          </button>
        ))}
      </div>
      {value !== 'none' && (
        <div className="flex items-center gap-3">
          <RevealImage
            src={imageUrl}
            effect={value}
            progress={progress}
            className="max-h-28 shrink-0 rounded-lg border-2 border-gray-200"
          />
          <span className="text-sm text-gray-500">
            Aperçu : l'image devient nette pendant le temps de réponse (sur l'écran partagé
            seulement).
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * « Ajouter un son »: upload, then pick the excerpt (start from the player's position,
 * duration 5–30 s), listen to it, and choose when it plays.
 */
export function AudioField({
  value,
  onReveal,
  errors,
  onChange,
  onRevealChange,
}: {
  value: QuestionAudio | undefined;
  onReveal: boolean;
  /** Field errors of `audio.url` / `audio.startSec` / `audio.durationSec`. */
  errors: { url?: string; startSec?: string; durationSec?: string };
  onChange: (audio: QuestionAudio | undefined) => void;
  onRevealChange: (onReveal: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLAudioElement>(null);
  /** End of the excerpt being listened to (« Écouter l'extrait »). */
  const stopAt = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function upload(file: File) {
    const invalid = checkAudioFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.uploads.audio(file);
      onChange({ url, startSec: 0, durationSec: value?.durationSec ?? AUDIO_DEFAULT_DURATION_SEC });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function stopPreview() {
    stopAt.current = null;
    setPreviewing(false);
    player.current?.pause();
  }

  function preview() {
    const el = player.current;
    if (!el || !value || Number.isNaN(value.startSec)) return;
    el.currentTime = value.startSec;
    stopAt.current = value.startSec + value.durationSec;
    setPreviewing(true);
    el.play().catch(stopPreview);
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={ACCEPTED_AUDIO}
      className="hidden"
      data-testid="audio-input"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void upload(file);
      }}
    />
  );
  const uploadError = error && (
    <span className="text-sm font-semibold text-answer-red">{error}</span>
  );

  if (!value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-gray-600">Son (facultatif)</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void upload(file);
          }}
          className="flex h-14 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-500 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {busy ? 'Envoi…' : '🎵 Ajouter un son'}
        </button>
        <span className="text-xs text-gray-400">
          MP3, OGG, M4A, WAV · 10 Mo max · joué sur l'écran partagé seulement
        </span>
        {fileInput}
        {uploadError}
      </div>
    );
  }

  const durations = [...new Set([...DURATIONS, value.durationSec])].sort((a, b) => a - b);
  const fieldError = errors.url ?? errors.startSec ?? errors.durationSec;
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <span className="mr-auto text-sm font-bold text-gray-600">🎵 Son</span>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="rounded bg-gray-100 px-2 py-0.5 text-xs font-bold"
        >
          {busy ? 'Envoi…' : 'Changer'}
        </button>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onChange(undefined);
          }}
          className="rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-answer-red"
        >
          Retirer
        </button>
      </div>
      <audio
        ref={player}
        src={value.url}
        controls
        preload="metadata"
        className="w-full"
        onPause={() => setPreviewing(false)}
        onTimeUpdate={(e) => {
          if (stopAt.current !== null && e.currentTarget.currentTime >= stopAt.current) {
            stopPreview();
          }
        }}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-gray-600">Début de l'extrait (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={Number.isNaN(value.startSec) ? '' : value.startSec}
            onChange={(e) => onChange({ ...value, startSec: e.target.valueAsNumber })}
            aria-invalid={!!errors.startSec}
            className={`w-24 rounded-lg border-2 px-2 py-1 font-bold ${errors.startSec ? 'border-answer-red' : 'border-gray-300'}`}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const t = player.current?.currentTime ?? 0;
            onChange({ ...value, startSec: Math.round(t * 10) / 10 });
          }}
          title="Le début de l'extrait = la position actuelle du lecteur"
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-bold"
        >
          ⏱ Position du lecteur
        </button>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-gray-600">Durée</span>
          <select
            value={value.durationSec}
            onChange={(e) => onChange({ ...value, durationSec: Number(e.target.value) })}
            className="rounded-lg border-2 border-gray-300 bg-white px-2 py-1 font-semibold"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} secondes
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={previewing ? stopPreview : preview}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white"
        >
          {previewing ? '■ Arrêter' : "▶ Écouter l'extrait"}
        </button>
      </div>
      {fieldError && <span className="text-sm font-semibold text-answer-red">{fieldError}</span>}
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={onReveal}
          onChange={(e) => onRevealChange(e.target.checked)}
        />
        Jouer à la révélation (au lieu de pendant la question)
      </label>
      {fileInput}
      {uploadError}
    </div>
  );
}
