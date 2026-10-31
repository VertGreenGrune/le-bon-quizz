import { AnimatePresence, motion } from 'framer-motion';
import { useFullscreen } from '../lib/fullscreen';

/**
 * Phone full screen (T41). `big`: join screen / lobby — « ⛶ Plein écran », or on iPhone the
 * « Sur l'écran d'accueil » hint; `icon`: a small ⛶ in the game header.
 */
export function FullscreenButton({ variant }: { variant: 'big' | 'icon' }) {
  const fs = useFullscreen();
  if (fs.support === 'homeScreen' && variant === 'big')
    return (
      <p className="max-w-sm text-center text-sm font-semibold opacity-85">
        📱 Sur iPhone, pour jouer sans les barres du navigateur : <b>Partager</b> ⬆︎ puis{' '}
        <b>« Sur l'écran d'accueil »</b>.
      </p>
    );
  if (fs.support !== 'api') return null;
  const label = fs.active ? 'Quitter le plein écran' : 'Plein écran';
  if (variant === 'icon')
    return (
      <button
        type="button"
        onClick={() => void (fs.active ? fs.exit() : fs.enter())}
        aria-label={label}
        title={label}
        data-testid="fullscreen-icon"
        className="flex size-7 items-center justify-center rounded-full bg-white/20 text-base leading-none"
      >
        {fs.active ? '🗗' : '⛶'}
      </button>
    );
  return (
    <button
      type="button"
      onClick={() => void (fs.active ? fs.exit() : fs.enter())}
      data-testid="fullscreen-button"
      className="touch-manipulation rounded-lg border-2 border-white/70 px-4 py-2 font-bold active:scale-95"
    >
      {fs.active ? '🗗 Quitter le plein écran' : '⛶ Plein écran'}
    </button>
  );
}

/** The browser left full screen by itself (phone locked…): offer it again, never automatically. */
export function FullscreenBanner() {
  const fs = useFullscreen();
  return (
    <AnimatePresence>
      {fs.dropped && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="flex items-center justify-center gap-2 bg-black/60 px-3 py-1.5 text-sm font-bold"
        >
          <button
            type="button"
            onClick={() => void fs.enter()}
            className="rounded-full bg-white px-3 py-0.5 text-brand"
          >
            ⛶ Revenir en plein écran
          </button>
          <button
            type="button"
            onClick={fs.dismiss}
            aria-label="Ignorer"
            className="px-2 opacity-80"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
