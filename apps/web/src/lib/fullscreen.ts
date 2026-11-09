import { useCallback, useState, useSyncExternalStore } from 'react';

/**
 * Phone full screen (T41): the Fullscreen API on a tap (never automatic), « Quitter » when
 * active, and a banner when the browser dropped it (phone locked, tab switched…). Where the API
 * doesn't exist (iPhone Safari) the page offers « Sur l'écran d'accueil » instead: the web app
 * manifest (`public/manifest.webmanifest`) opens it without browser bars.
 */

/** The parts of `document` / `navigator` used here (fakes in the unit tests). */
export interface FullscreenEnv {
  doc: {
    fullscreenEnabled?: boolean;
    fullscreenElement?: Element | null;
    documentElement: { requestFullscreen?: (options?: FullscreenOptions) => Promise<void> };
    exitFullscreen?: () => Promise<void>;
  };
  /** `display-mode` media query of an installed web app. */
  standalone: boolean;
  userAgent: string;
  lockPortrait?: () => Promise<void>;
}

export function browserEnv(): FullscreenEnv | null {
  if (typeof document === 'undefined') return null;
  const nav = navigator as Navigator & { standalone?: boolean };
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (o: 'portrait') => Promise<void>;
  };
  return {
    doc: document,
    standalone:
      nav.standalone === true ||
      matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches,
    userAgent: nav.userAgent,
    lockPortrait: orientation?.lock ? () => orientation.lock!('portrait') : undefined,
  };
}

export type FullscreenSupport =
  /** Already without browser bars (installed web app): nothing to offer. */
  | 'standalone'
  /** The Fullscreen API works: « ⛶ Plein écran ». */
  | 'api'
  /** iPhone / iPad Safari: no API, « Partager → Sur l'écran d'accueil ». */
  | 'homeScreen'
  | 'none';

export function fullscreenSupport(env: FullscreenEnv | null): FullscreenSupport {
  if (!env) return 'none';
  if (env.standalone) return 'standalone';
  if (env.doc.fullscreenEnabled && typeof env.doc.documentElement.requestFullscreen === 'function')
    return 'api';
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return 'homeScreen';
  return 'none';
}

/** Full screen on a tap, then portrait when the browser allows it (failures ignored). */
export async function enterFullscreen(env: FullscreenEnv): Promise<boolean> {
  try {
    await env.doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    return false;
  }
  await env.lockPortrait?.().catch(() => {});
  return true;
}

/**
 * « Dessine-moi »: lets the drawer turn the phone sideways (a bigger pad) although full screen /
 * the installed app lock portrait; the returned function puts the portrait lock back. Browsers
 * without the API, or not in full screen (no lock to lift), just refuse — ignored.
 */
export function allowRotation(): () => void {
  const env = browserEnv();
  const orientation = (typeof screen !== 'undefined' ? screen.orientation : undefined) as
    (ScreenOrientation & { lock?: (o: 'any' | 'portrait') => Promise<void> }) | undefined;
  if (!env || !orientation?.lock) return () => {};
  orientation.lock('any').catch(() => {});
  return () => {
    if (env.doc.fullscreenElement || env.standalone) orientation.lock!('portrait').catch(() => {});
  };
}

export async function exitFullscreen(env: FullscreenEnv): Promise<void> {
  if (env.doc.fullscreenElement) await env.doc.exitFullscreen?.().catch(() => {});
}

// ---------- React ----------

/** Asked by the player and not left on purpose: dropped by the browser → banner. */
let wanted = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  document.addEventListener('fullscreenchange', l);
  return () => {
    listeners.delete(l);
    document.removeEventListener('fullscreenchange', l);
  };
}

const isActive = () => typeof document !== 'undefined' && !!document.fullscreenElement;
const isWanted = () => wanted;

export function useFullscreen() {
  const [env] = useState(browserEnv);
  const support = fullscreenSupport(env);
  const active = useSyncExternalStore(subscribe, isActive, () => false);
  const wantedNow = useSyncExternalStore(subscribe, isWanted, () => false);

  const enter = useCallback(async () => {
    if (!env) return;
    wanted = await enterFullscreen(env);
    notify();
  }, [env]);
  const exit = useCallback(async () => {
    if (!env) return;
    wanted = false;
    notify();
    await exitFullscreen(env);
  }, [env]);
  const dismiss = useCallback(() => {
    wanted = false;
    notify();
  }, []);

  return {
    support,
    active,
    /** The browser left full screen by itself: offer to come back (never automatic). */
    dropped: support === 'api' && wantedNow && !active,
    enter,
    exit,
    dismiss,
  };
}
