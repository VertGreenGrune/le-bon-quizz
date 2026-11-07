import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ErrorPayload } from '@lbq/shared';
import { getSocket } from '../lib/socket';
import { joinOrigins } from './joinUrl';
import { saveRemoteToken } from '../remote/remoteState';
import { remoteUrl } from './remoteUrl';

/** Address to open on the TV (T47): the `/tv` page, on the LAN address in dev. */
export function tvUrl(origin: string): string {
  return `${origin}/tv`;
}

const TV_SCREEN_KEY = 'lbq:tv-screen';

/** This tab is a TV paired through `/tv` (hides « Afficher sur la TV », keeps the screen on). */
export function markTvScreen(): void {
  try {
    sessionStorage.setItem(TV_SCREEN_KEY, '1');
  } catch {
    // Private mode: the button just stays visible.
  }
}

export function isTvScreen(): boolean {
  try {
    return sessionStorage.getItem(TV_SCREEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Keeps the digits of what was typed, at most 4. */
export function cleanTvCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 4);
}

/**
 * « 📺 Afficher sur la TV » (T47): sends the game to the `/tv` page showing the typed code. That
 * page becomes the host screen; this device then turns into the « Télécommande » (a full page
 * load, so this screen's sounds stop and only the TV plays them).
 */
export function CastButton({
  pin,
  hostToken,
  remoteToken,
}: {
  pin: string;
  hostToken: string;
  remoteToken: (revoke?: boolean) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border-2 border-white/60 px-3 py-1 hover:bg-white/10"
        title="Afficher la partie sur une TV (Fire TV, Smart TV…)"
      >
        📺 Afficher sur la TV
      </button>
      <AnimatePresence>
        {open && (
          <CastDialog
            pin={pin}
            hostToken={hostToken}
            remoteToken={remoteToken}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function CastDialog({
  pin,
  hostToken,
  remoteToken,
  onClose,
}: {
  pin: string;
  hostToken: string;
  remoteToken: (revoke?: boolean) => Promise<string>;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const origins = joinOrigins();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 4 || sending) return;
    setSending(true);
    setError(null);
    getSocket().emit('host:cast', { pin, hostToken, code }, (res) => {
      if (!res.ok) {
        setSending(false);
        setError(res.error.message);
        return;
      }
      remoteToken().then(
        (token) => {
          saveRemoteToken(pin, token);
          location.assign(remoteUrl(location.origin, pin, token));
        },
        (err: ErrorPayload) => {
          setSending(false);
          setError(`La partie est sur la TV, mais pas de télécommande : ${err.message}`);
        },
      );
    });
  };

  return (
    <motion.div
      role="dialog"
      aria-label="Afficher sur la TV"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/80 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col gap-4 rounded-3xl bg-white p-8 text-gray-900 shadow-2xl"
      >
        <h2 className="text-3xl font-black">📺 Afficher sur la TV</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-lg">
          <li>
            Sur la TV (Fire TV : application <strong>Silk</strong> ou un autre navigateur), ouvre{' '}
            <strong className="break-all" data-testid="tv-url">
              {tvUrl(origins[0]!)}
            </strong>
            {origins.length > 1 && (
              <span className="text-base text-gray-600">
                {' '}
                (ou {origins.slice(1).map(tvUrl).join(', ')})
              </span>
            )}
          </li>
          <li>Tape ici le code à 4 chiffres affiché sur la TV.</li>
        </ol>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          aria-label="Code de la TV"
          placeholder="0000"
          value={code}
          onChange={(e) => setCode(cleanTvCode(e.target.value))}
          className="rounded-2xl border-4 border-gray-300 px-4 py-3 text-center font-mono text-5xl font-black tracking-[0.3em] focus:border-brand focus:outline-none"
        />
        {error && (
          <p role="alert" className="font-semibold text-red-600">
            {error}
          </p>
        )}
        <p className="text-base text-gray-600">
          La TV devient l’écran de jeu (avec le son) et cet appareil passe en télécommande.
        </p>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={code.length !== 4 || sending}
            className="rounded-xl bg-brand px-6 py-3 text-xl font-black text-white disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer sur la TV'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 border-gray-300 px-5 py-3 text-lg font-bold"
          >
            Annuler
          </button>
        </div>
      </form>
    </motion.div>
  );
}
