import { useRef, useState } from 'react';
import { api } from '../api';
import { ACCEPTED_IMAGE_TYPES, checkImageFile } from './imageFile';
import { mediaUrl } from '../lib/mediaUrl';

/** Uploads an image to `/api/uploads/image` and stores its URL. */
export function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    const invalid = checkImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onChange((await api.uploads.image(file)).url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-bold text-gray-600">{label}</span>
      {value ? (
        <div className="relative overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50">
          <img src={mediaUrl(value)} alt="" className="mx-auto max-h-40 object-contain" />
          <div className="absolute top-1 right-1 flex gap-1">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded bg-white/90 px-2 py-0.5 text-xs font-bold shadow"
            >
              Changer
            </button>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded bg-white/90 px-2 py-0.5 text-xs font-bold text-answer-red shadow"
            >
              Retirer
            </button>
          </div>
        </div>
      ) : (
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
          className="flex h-28 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-500 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {busy ? 'Envoi…' : '+ Ajouter une image'}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
      {error && <span className="text-sm font-semibold text-answer-red">{error}</span>}
    </div>
  );
}
