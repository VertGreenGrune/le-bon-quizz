import { useRef, useState } from 'react';
import { MATCH_MAX_PAIRS, MATCH_MIN_PAIRS, MATCH_TEXT_MAX_LENGTH } from '@lbq/shared';
import { api } from '../api';
import { mediaUrl } from '../lib/mediaUrl';
import { newMatchPair, type DraftQuestion, type MatchDraftSide } from './draft';
import { ACCEPTED_IMAGE_TYPES, checkImageFile } from './imageFile';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

/**
 * « Associer » (T67): the pairs, a left and a right side each — a text, a picture, or both.
 * The game shuffles both columns, so the order here doesn't matter.
 */
export function MatchFields({ q, err, onChange }: FieldProps) {
  const pairs = q.matchPairs;
  const setSide = (i: number, which: 'left' | 'right', side: MatchDraftSide) =>
    onChange({
      ...q,
      matchPairs: pairs.map((p, j) => (j === i ? { ...p, [which]: side } : p)),
    });
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-gray-600">
        Paires à associer ({pairs.length} / {MATCH_MAX_PAIRS})
      </h3>
      <p className="text-sm text-gray-500">
        Écris chaque élément avec son partenaire, sur la même ligne : un texte, une image, ou les
        deux. Pendant la partie, les deux colonnes sont mélangées.
      </p>
      <ol className="flex flex-col gap-2">
        {pairs.map((pair, i) => (
          <li key={i} className="flex flex-col gap-1">
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2"
              data-testid={`match-pair-${i}`}
            >
              <SideField
                label={`Élément ${i + 1} (gauche)`}
                side={pair.left}
                onChange={(side) => setSide(i, 'left', side)}
              />
              <span className="font-black text-gray-400" aria-hidden="true">
                ↔
              </span>
              <SideField
                label={`Partenaire ${i + 1} (droite)`}
                side={pair.right}
                onChange={(side) => setSide(i, 'right', side)}
              />
              <button
                type="button"
                title="Retirer la paire"
                disabled={pairs.length <= MATCH_MIN_PAIRS}
                onClick={() => onChange({ ...q, matchPairs: pairs.filter((_, j) => j !== i) })}
                className="rounded px-2 py-1 font-bold text-answer-red hover:bg-red-50 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
            {(err(`.pairs.${i}.left`) || err(`.pairs.${i}.right`)) && (
              <p className="text-sm font-semibold text-answer-red">
                Paire {i + 1} : il faut un texte ou une image de chaque côté.
              </p>
            )}
          </li>
        ))}
      </ol>
      {err('.pairs') && <p className="text-sm font-semibold text-answer-red">{err('.pairs')}</p>}
      <button
        type="button"
        disabled={pairs.length >= MATCH_MAX_PAIRS}
        onClick={() => onChange({ ...q, matchPairs: [...pairs, newMatchPair()] })}
        className="self-start rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
      >
        + Ajouter une paire
      </button>
    </section>
  );
}

/** One side: a text field and an optional picture (uploaded on the spot). */
function SideField({
  label,
  side,
  onChange,
}: {
  label: string;
  side: MatchDraftSide;
  onChange: (side: MatchDraftSide) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    const invalid = checkImageFile(file);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    try {
      onChange({ ...side, imageUrl: (await api.uploads.image(file)).url });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        {side.imageUrl ? (
          <span className="relative shrink-0">
            <img
              src={mediaUrl(side.imageUrl)}
              alt=""
              className="size-10 rounded border border-gray-200 object-cover"
            />
            <button
              type="button"
              title="Retirer l’image"
              onClick={() => onChange({ text: side.text })}
              className="absolute -top-1.5 -right-1.5 rounded-full bg-white px-1 text-xs font-bold text-answer-red shadow"
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            type="button"
            title="Ajouter une image"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="shrink-0 rounded border-2 border-dashed border-gray-300 px-1.5 py-1 text-sm hover:border-brand disabled:opacity-50"
          >
            {busy ? '…' : '🖼️'}
          </button>
        )}
        <input
          aria-label={label}
          value={side.text}
          maxLength={MATCH_TEXT_MAX_LENGTH}
          placeholder={side.imageUrl ? 'Texte (facultatif)' : 'Texte'}
          onChange={(e) => onChange({ ...side, text: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border-2 border-gray-300 px-2 py-1.5 outline-none focus:border-brand"
        />
      </div>
      {error && <span className="text-xs font-semibold text-answer-red">{error}</span>}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
