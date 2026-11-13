import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import type { ErrorPayload, ServerToClientEvents, TvAction } from '@lbq/shared';
import { getSocket } from '../lib/socket';
import { joinOrigins } from './joinUrl';
import { remoteToast, remoteUrl } from './remoteUrl';
import { getSoundLevels, setLevels, setMuted, stepLevel } from './sounds';

/**
 * « 📱 Télécommande » on the TV (T39): how many remotes are connected (`remote:status`), a toast
 * when one connects / disconnects, and the token of the remote link (asked when the dialog opens).
 */
export function useRemotePairing(pin: string | undefined, hostToken: string | null) {
  const [remotes, setRemotes] = useState(0);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onStatus: ServerToClientEvents['remote:status'] = ({ remotes }) => {
      const text = remoteToast(previous.current, remotes);
      previous.current = remotes;
      setRemotes(remotes);
      if (text) setToast({ text, at: Date.now() });
    };
    socket.on('remote:status', onStatus);
    return () => {
      socket.off('remote:status', onStatus);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  /** The token of the remote link; `revoke` = a new one, the paired remotes are dropped. */
  const remoteToken = (revoke = false): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!pin || !hostToken) return reject(new Error('no game'));
      getSocket().emit('host:remote', { pin, hostToken, ...(revoke && { revoke: true }) }, (res) =>
        res.ok ? resolve(res.remoteToken) : reject(res.error),
      );
    });

  return { remotes, toast: toast?.text ?? null, remoteToken };
}

/**
 * Controls pressed on the remote, played on the TV: 🔇 / 🔊, ↻ the sound clip, « Musique − / + »
 * (`MUSIC_STEP` of the « Musique et effets » level), « 🌙 Soirée » (T66: podium ↔ evening ranking).
 */
export function useTvControls(onReplay: () => void, onEvening?: () => void): void {
  const replay = useRef(onReplay);
  replay.current = onReplay;
  const evening = useRef(onEvening);
  evening.current = onEvening;
  useEffect(() => {
    const socket = getSocket();
    const onControl: ServerToClientEvents['tv:control'] = ({ action }: { action: TvAction }) => {
      if (action === 'mute') setMuted(true);
      else if (action === 'unmute') setMuted(false);
      else if (action === 'music-down' || action === 'music-up') {
        setLevels({ music: stepLevel(getSoundLevels().music, action === 'music-up') });
      } else if (action === 'evening') evening.current?.();
      else replay.current();
    };
    socket.on('tv:control', onControl);
    return () => {
      socket.off('tv:control', onControl);
    };
  }, []);
}

/** Header button + its dialog (the QR code is only shown on demand, never in the lobby). */
export function RemoteButton({
  pin,
  remotes,
  remoteToken,
}: {
  pin: string;
  remotes: number;
  remoteToken: (revoke?: boolean) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border-2 border-white/60 px-3 py-1 hover:bg-white/10"
        title="Piloter la partie depuis ton téléphone"
      >
        📱 {remotes > 0 ? 'Télécommande connectée' : 'Télécommande'}
      </button>
      <AnimatePresence>
        {open && (
          <RemoteDialog
            pin={pin}
            remotes={remotes}
            remoteToken={remoteToken}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function RemoteDialog({
  pin,
  remotes,
  remoteToken,
  onClose,
}: {
  pin: string;
  remotes: number;
  remoteToken: (revoke?: boolean) => Promise<string>;
  onClose: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const origins = joinOrigins();
  const [originIndex, setOriginIndex] = useState(0);
  const origin = origins[originIndex % origins.length]!;

  useEffect(() => {
    // Once, when the dialog opens.
    remoteToken().then(setToken, (err: ErrorPayload) => setError(err.message));
  }, []);

  const revoke = () => {
    if (!confirm('Déconnecter la télécommande ? Il faudra scanner le nouveau QR code.')) return;
    remoteToken(true).then(
      (t) => {
        setToken(t);
        setRevoked(true);
      },
      (err: ErrorPayload) => setError(err.message),
    );
  };

  const url = token ? remoteUrl(origin, pin, token) : null;
  return (
    <motion.div
      role="dialog"
      aria-label="Télécommande"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/80 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-w-3xl items-center gap-10 rounded-3xl bg-white p-10 text-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 rounded-2xl bg-white p-2">
          {url ? (
            <QRCodeSVG value={url} size={280} data-testid="remote-qr" />
          ) : (
            <div className="flex size-[280px] items-center justify-center text-gray-500">
              {error ?? 'Préparation…'}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-4xl font-black">📱 Télécommande</h2>
          <p className="text-xl">
            Scanne ce QR code avec <strong>ton</strong> téléphone pour piloter la partie : suivant,
            pause, buzzer, et voir la réponse en secret.
          </p>
          <p className="text-base text-gray-600">
            Ne le montre pas aux joueurs : ce lien donne le contrôle de la partie.
          </p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              data-testid="remote-link"
              className="text-sm break-all text-brand underline"
            >
              {url.replace(/#.*/, '#…')}
            </a>
          )}
          {origins.length > 1 && (
            <button
              type="button"
              onClick={() => setOriginIndex((i) => i + 1)}
              className="self-start text-sm text-gray-600 underline"
            >
              Le téléphone n'arrive pas à ouvrir le lien ? Essayer une autre adresse
            </button>
          )}
          <p className="text-lg font-semibold" role="status">
            {revoked
              ? 'Télécommande déconnectée. Scanne le nouveau QR code pour la reconnecter.'
              : remotes > 0
                ? `✅ ${remotes > 1 ? `${remotes} télécommandes connectées` : 'Télécommande connectée'}`
                : 'Aucune télécommande connectée.'}
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-brand px-6 py-3 text-xl font-black text-white"
            >
              Fermer
            </button>
            {token && (
              <button
                type="button"
                onClick={revoke}
                className="rounded-xl border-2 border-gray-300 px-5 py-3 text-lg font-bold"
              >
                Déconnecter la télécommande
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** « 📱 Télécommande connectée / déconnectée », top of the TV. */
export function RemoteToast({ text }: { text: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-50 flex justify-center">
      <AnimatePresence>
        {text && (
          <motion.p
            key={text}
            role="status"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-full bg-gray-900/90 px-6 py-2 text-2xl font-black shadow-xl"
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
