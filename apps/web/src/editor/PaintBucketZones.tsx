import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COLORS_MAX_TOLERANCE,
  COLORS_MAX_ZONES,
  COLORS_MIN_TOLERANCE,
  COLORS_MIN_ZONES,
  colorLabel,
  isBucketZone,
} from '@lbq/shared';
import { api } from '../api';
import { PinPicture } from '../components/PinPicture';
import { mediaUrl } from '../lib/mediaUrl';
import {
  blankKey,
  computeRegions,
  regionAt,
  regionShare,
  whiten,
  workingSize,
  type Pixels,
} from '../lib/paintBucket';
import { textOn } from '../lib/colors';
import { btn } from './EditorShell';
import { addColorZone, removeColorZone, updateColorZone, type DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

/** A region smaller than this share of the picture is probably a mis-tap. */
const TINY_REGION = 0.002;
/** Wait for the zones to settle before making the blank picture. */
const BLANK_DELAY_MS = 600;
/** Above this size the blank picture is sent as a JPEG (uploads take 5 MB at most). */
const PNG_MAX_BYTES = 4_500_000;

/** Reads a picture's pixels (a copy at most `BUCKET_MAX_SIDE` wide / high). */
async function loadPixels(url: string): Promise<Pixels> {
  // fetch, not <img>: the file must be read with CORS (the server allows any origin).
  const res = await fetch(mediaUrl(url), { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const { width, height } = workingSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), type, quality),
  );
}

/** The blank picture (every region in white), as a file to upload. */
async function blankFile(px: Pixels, masks: readonly Uint8Array[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(whiten(px, masks), px.width, px.height), 0, 0);
  const png = await toBlob(canvas, 'image/png');
  return png.size <= PNG_MAX_BYTES ? png : toBlob(canvas, 'image/jpeg', 0.9);
}

/**
 * « Couleurs perdues » on a picture (T65): a tap = a paint bucket — the area of similar color
 * around the tap (« Tolérance » per zone) becomes a zone, its average color the color to find. A
 * tap inside a zone selects it. The editor then uploads the picture with every zone in white
 * (`colorBlankImageUrl`), shown during the answers.
 */
export function PaintBucketZones({ q, err, onChange }: FieldProps) {
  const zones = q.colorZones;
  const full = zones.length >= COLORS_MAX_ZONES;
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [blankState, setBlankState] = useState<'idle' | 'working' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const latest = useRef(q);
  latest.current = q;
  const change = useRef(onChange);
  change.current = onChange;
  const overlay = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setPixels(null);
    setLoadError(false);
    if (!q.imageUrl) return;
    let alive = true;
    loadPixels(q.imageUrl).then(
      (px) => alive && setPixels(px),
      () => alive && setLoadError(true),
    );
    return () => {
      alive = false;
    };
  }, [q.imageUrl]);

  const key = blankKey(q.imageUrl, zones);
  const regions = useMemo(
    () => (pixels ? computeRegions(pixels, zones) : null),
    // The regions depend on the zones' places and tolerances only (`key`), not their colors.
    [pixels, key],
  );

  // The highlighted regions, drawn over the picture.
  useEffect(() => {
    const canvas = overlay.current;
    if (!canvas || !pixels || !regions) return;
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(pixels.width, pixels.height);
    const out = image.data;
    regions.masks.forEach((mask, zone) => {
      const strong = zone === selected;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const x = i % pixels.width;
        const y = (i / pixels.width) | 0;
        const stripe = ((x + y) >> 3) & 1;
        const o = i * 4;
        if (stripe) {
          out[o] = 255;
          out[o + 1] = 255;
          out[o + 2] = 255;
          out[o + 3] = strong ? 210 : 150;
        } else {
          out[o] = strong ? 250 : 109;
          out[o + 1] = strong ? 204 : 40;
          out[o + 2] = strong ? 21 : 217;
          out[o + 3] = strong ? 200 : 120;
        }
      }
    });
    ctx.putImageData(image, 0, 0);
  }, [pixels, regions, selected]);

  // The blank picture, made again (after a short delay) whenever the zones change.
  const hasBucket = zones.some(isBucketZone);
  const fresh = !!q.colorBlankImageUrl && q.colorBlankKey === key;
  useEffect(() => {
    if (!pixels || !regions || !hasBucket || fresh) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setBlankState('working');
      try {
        const { url } = await api.uploads.image(await blankFile(pixels, regions.masks));
        const now = latest.current;
        if (!alive || blankKey(now.imageUrl, now.colorZones) !== key) return;
        change.current({ ...now, colorBlankImageUrl: url, colorBlankKey: key });
        setBlankState('idle');
      } catch {
        if (alive) setBlankState('error');
      }
    }, BLANK_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pixels, regions, key, hasBucket, fresh, retry]);

  /** New zones: their colors measured again (a region can grow when an earlier one changes). */
  const apply = (next: DraftQuestion) => {
    if (!pixels) return onChange(next);
    const { colors } = computeRegions(pixels, next.colorZones);
    onChange({
      ...next,
      colorZones: next.colorZones.map((z, i) => ({ ...z, color: colors[i] ?? z.color })),
    });
  };

  const tap = (x: number, y: number) => {
    if (!pixels || !regions) return;
    const inside = regionAt(pixels, regions.masks, x, y);
    if (inside >= 0) return setSelected(inside);
    if (full) return;
    apply(addColorZone(q, x, y));
    setSelected(zones.length);
  };

  if (!q.imageUrl)
    return (
      <div className="flex flex-col gap-1">
        <p className="rounded-lg bg-answer-yellow/20 px-3 py-2 font-semibold">
          Ajoute une image ci-dessus (un dessin, une affiche, une photo colorée…) pour choisir les
          zones.
        </p>
        <FieldError message={err('.imageUrl')} />
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold">
        🎨 Touche une partie de l’image : la zone de couleur proche autour devient une zone à
        retrouver ({zones.length} / {COLORS_MAX_ZONES}, au moins {COLORS_MIN_ZONES}). Pendant la
        partie, elle sera blanche ; les joueurs ne verront que les couleurs de tes zones.
      </p>
      {loadError ? (
        <p className="rounded-lg bg-answer-red/15 px-3 py-2 font-semibold text-answer-red">
          Impossible de lire les couleurs de l’image. Réessaie avec une autre image.
        </p>
      ) : !pixels ? (
        <p className="text-sm text-gray-500">Chargement de l’image…</p>
      ) : null}
      <div className="max-w-full self-start overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50">
        <PinPicture
          src={q.imageUrl}
          imgClassName="max-h-96 max-w-full"
          onPick={pixels ? (p) => tap(p.x, p.y) : undefined}
        >
          <canvas
            ref={overlay}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
            data-testid="bucket-overlay"
          />
          {zones.map((z, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-sm font-black shadow-[0_0_0_2px_rgba(0,0,0,0.6)] ${i === selected ? 'ring-4 ring-answer-yellow' : ''}`}
              style={{
                left: `${z.x * 100}%`,
                top: `${z.y * 100}%`,
                backgroundColor: z.color,
                color: textOn(z.color),
              }}
            >
              {i + 1}
            </span>
          ))}
        </PinPicture>
      </div>
      <ol className="flex flex-col gap-2" data-testid="bucket-zones">
        {zones.map((z, i) => {
          const share = regions?.masks[i] ? regionShare(regions.masks[i]) : null;
          return (
            <li
              key={i}
              className={`flex flex-wrap items-center gap-2 rounded-lg p-2 ${i === selected ? 'bg-answer-yellow/25' : 'bg-gray-50'}`}
              onClick={() => setSelected(i)}
              data-testid="bucket-zone"
              data-color={z.color}
            >
              <span className="w-6 text-center font-black">{i + 1}</span>
              <span
                className="size-8 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                style={{ backgroundColor: z.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 text-sm font-semibold">
                {colorLabel(z.color)} <span className="text-gray-500">{z.color}</span>
              </span>
              {isBucketZone(z) ? (
                <label className="flex min-w-0 flex-1 basis-40 items-center gap-2 text-sm font-semibold">
                  Tolérance
                  <input
                    type="range"
                    min={COLORS_MIN_TOLERANCE}
                    max={COLORS_MAX_TOLERANCE}
                    value={z.tolerance}
                    onChange={(e) =>
                      apply(updateColorZone(q, i, { tolerance: Number(e.target.value) }))
                    }
                    aria-label={`Tolérance de la zone ${i + 1}`}
                    className="min-w-0 flex-1 accent-brand"
                  />
                  <span className="w-7 text-right tabular-nums">{z.tolerance}</span>
                </label>
              ) : (
                <span className="flex-1 text-sm text-gray-500">zone ronde (ancienne)</span>
              )}
              <button
                type="button"
                className={`${btn.ghost} ml-auto`}
                onClick={(e) => {
                  e.stopPropagation();
                  apply(removeColorZone(q, i));
                  setSelected(-1);
                }}
                aria-label={`Supprimer la zone ${i + 1}`}
              >
                ✕
              </button>
              {share !== null && share < TINY_REGION && isBucketZone(z) && (
                <p className="w-full text-sm font-semibold text-answer-red">
                  Zone minuscule : augmente la tolérance ou touche ailleurs.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {hasBucket && (
        <p className="text-sm font-semibold text-gray-600" data-testid="blank-status">
          {blankState === 'error' ? (
            <span className="text-answer-red">
              L’image aux zones blanches n’a pas pu être envoyée.{' '}
              <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
                Réessayer
              </button>
            </span>
          ) : fresh ? (
            '✅ Image aux zones blanches prête'
          ) : (
            '⏳ Préparation de l’image aux zones blanches…'
          )}
        </p>
      )}
      {hasBucket && fresh && (
        <img
          src={mediaUrl(q.colorBlankImageUrl)}
          alt="Image aux zones blanches"
          className="max-h-40 max-w-full self-start rounded-lg border-2 border-gray-200"
          data-testid="blank-preview"
        />
      )}
      <FieldError message={err('.zones') ?? err('.blankImageUrl') ?? err('.imageUrl')} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-sm font-semibold text-answer-red">{message}</span> : null;
}
