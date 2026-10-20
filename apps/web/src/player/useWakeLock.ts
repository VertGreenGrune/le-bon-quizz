import { useEffect } from 'react';
import NoSleep from 'nosleep.js';

/**
 * Keeps the phone screen on while `active` (a game is in progress), so it doesn't lock between
 * questions. Uses the Screen Wake Lock API, re-acquired whenever the page becomes visible again
 * (the browser releases it when the tab is hidden). That API needs a secure context (HTTPS or
 * localhost): on plain-HTTP LAN dev, or old browsers, falls back to NoSleep.js's silent looping
 * video, which can only be started from a tap (see `primeWakeLock`).
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return hasNativeWakeLock() ? holdNativeWakeLock() : holdVideoWakeLock();
  }, [active]);
}

/**
 * Call synchronously from a tap handler (the join button): starts the video fallback while the
 * user gesture is still valid, so the screen stays on during the lobby wait already.
 */
export function primeWakeLock(): void {
  if (!hasNativeWakeLock()) startVideo();
}

function hasNativeWakeLock() {
  return 'wakeLock' in navigator;
}

function holdNativeWakeLock(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let pending = false;
  let stopped = false;

  const acquire = async () => {
    if (stopped || pending || document.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    pending = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (stopped) void s.release();
      else sentinel = s;
    } catch {
      // Refused (battery saver, page hidden…): retried on the next visibility change / tap.
    } finally {
      pending = false;
    }
  };

  void acquire();
  document.addEventListener('visibilitychange', acquire);
  document.addEventListener('pointerdown', acquire, { capture: true, passive: true });
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', acquire);
    document.removeEventListener('pointerdown', acquire, { capture: true });
    void sentinel?.release().catch(() => {});
  };
}

let video: NoSleep | undefined;

function startVideo() {
  video ??= new NoSleep();
  // play() on a playing video is a no-op; rejected without a user gesture.
  video.enable().catch(() => {});
}

let videoHolders = 0;

function holdVideoWakeLock(): () => void {
  videoHolders++;
  // The browser pauses the video when the tab is hidden: the next tap restarts it.
  document.addEventListener('pointerdown', startVideo, { capture: true, passive: true });
  return () => {
    videoHolders--;
    document.removeEventListener('pointerdown', startVideo, { capture: true });
    // Deferred: a StrictMode remount must not stop the video primed by the join tap.
    setTimeout(() => {
      if (videoHolders === 0) video?.disable();
    });
  };
}
