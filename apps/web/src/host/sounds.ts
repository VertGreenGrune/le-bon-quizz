import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GamePhase, QuizTheme } from '@lbq/shared';
import { getTheme, type ThemedSound } from '../themes';

/** Host screen only — phones never play sounds. Files and licenses: `public/sounds/CREDITS.md`. */
export type SoundName =
  'lobby' | 'join' | 'tick' | 'reveal' | 'podium' | 'joker' | 'eliminated' | 'buzz';

const VOLUME: Record<SoundName, number> = {
  lobby: 0.45,
  join: 0.6,
  tick: 0.7,
  reveal: 0.8,
  podium: 0.9,
  joker: 0.7,
  eliminated: 0.8,
  buzz: 0.8,
};

/**
 * File of a sound (without `.wav`) for a TV theme (T40): the theme's lobby music / reveal /
 * podium, the classic file otherwise.
 */
export function soundFile(name: SoundName, theme: QuizTheme = 'classic'): string {
  return getTheme(theme).sounds[name as ThemedSound] ?? name;
}

/** Volume factor of the game sounds while a question's sound clip plays. */
export const DUCK_FACTOR = 0.3;

const MUTE_KEY = 'lbq:host:muted';

/** Reads the remembered mute choice; storage may be missing or throw (private mode…). */
export function readMuted(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMuted(storage: Pick<Storage, 'setItem'> | undefined, muted: boolean) {
  try {
    storage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Not remembered, but the toggle still works for this page.
  }
}

function localStorageOrUndefined(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

// ---------- Player (module-level: one host screen per tab) ----------

/** Read lazily: touching `localStorage` at import time warns under Node (unit tests). */
let muted: boolean | null = null;
const isMuted = () => (muted ??= readMuted(localStorageOrUndefined()));
const listeners = new Set<() => void>();
/** One element per sound *file* (a theme swaps some files). */
const elements = new Map<string, HTMLAudioElement>();
let soundTheme: QuizTheme = 'classic';
/** The looping sound that should be playing (even while muted / blocked by autoplay). */
let wantedLoop: SoundName | null = null;
let unlockPending = false;
/** A question's sound clip is playing (`clipPlayer.ts`): the game sounds are quieter. */
let ducked = false;

const volumes = new Map<HTMLAudioElement, number>();

function applyVolume(el: HTMLAudioElement) {
  el.volume = (volumes.get(el) ?? 1) * (ducked ? DUCK_FACTOR : 1);
}

export function setDucked(value: boolean) {
  ducked = value;
  for (const el of elements.values()) applyVolume(el);
}

function element(name: SoundName): HTMLAudioElement {
  const file = soundFile(name, soundTheme);
  let el = elements.get(file);
  if (!el) {
    el = new Audio(`${import.meta.env.BASE_URL}sounds/${file}.wav`);
    el.preload = 'auto';
    volumes.set(el, VOLUME[name]);
    applyVolume(el);
    elements.set(file, el);
  }
  return el;
}

/** TV theme of the sounds; a lobby music already playing switches to the new theme's. */
export function setSoundTheme(theme: QuizTheme) {
  if (theme === soundTheme) return;
  const loop = wantedLoop;
  if (loop) element(loop).pause();
  soundTheme = theme;
  if (loop) startLoop(loop);
}

/**
 * Browsers block audio until the page got a user gesture. A host who opens `/host/:pin`
 * directly hasn't clicked yet: retry the lobby music on the first click / key press.
 */
function waitForUnlock() {
  if (unlockPending) return;
  unlockPending = true;
  const unlock = () => {
    unlockPending = false;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    if (wantedLoop) startLoop(wantedLoop);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function tryPlay(el: HTMLAudioElement) {
  el.play().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'NotAllowedError') waitForUnlock();
  });
}

function startLoop(name: SoundName) {
  if (isMuted() || typeof Audio === 'undefined') return;
  const el = element(name);
  el.loop = true;
  if (el.paused) tryPlay(el);
}

export function playSound(name: SoundName) {
  if (isMuted() || typeof Audio === 'undefined') return;
  const el = element(name);
  el.currentTime = 0;
  tryPlay(el);
}

export function loopSound(name: SoundName | null) {
  if (wantedLoop && wantedLoop !== name) element(wantedLoop).pause();
  wantedLoop = name;
  if (name) startLoop(name);
}

export function stopAllSounds() {
  wantedLoop = null;
  for (const el of elements.values()) el.pause();
}

export function setMuted(value: boolean) {
  muted = value;
  writeMuted(localStorageOrUndefined(), value);
  if (value) for (const el of elements.values()) el.pause();
  else if (wantedLoop) startLoop(wantedLoop);
  listeners.forEach((l) => l());
}

export function useMuted(): boolean {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, isMuted);
}

// ---------- Game → sounds ----------

/** Seconds at the end of ANSWERING that tick. */
export const TICK_FROM_SEC = 5;

/** Which one-shot sound a phase change triggers (none when the screen is first shown). */
export function phaseSound(prev: GamePhase | null, next: GamePhase | null): SoundName | null {
  if (prev === null || prev === next) return null; // first state after a (re)load: no replay
  if (next === 'REVEAL') return 'reveal';
  if (next === 'PODIUM') return 'podium';
  return null;
}

/**
 * « Buzzer »: a player just took the hand (`prev` undefined = first state after a (re)load:
 * no replay).
 */
export function shouldBuzz(prev: string | null | undefined, next: string | null): boolean {
  return prev !== undefined && next !== null && next !== prev;
}

export function shouldTick(phase: GamePhase | null, remainingSec: number | null): boolean {
  return (
    phase === 'ANSWERING' &&
    remainingSec != null &&
    remainingSec >= 1 &&
    remainingSec <= TICK_FROM_SEC
  );
}

/** Drives every host sound from the game state. */
export function useHostSounds({
  phase,
  remainingSec,
  resumeCount = null,
  playerCount,
  buzzerHolder = null,
  theme = 'classic',
}: {
  phase: GamePhase | null;
  /** null while paused: the frozen clock doesn't tick. */
  remainingSec: number | null;
  /** 3-2-1 countdown before a paused game resumes. */
  resumeCount?: number | null;
  playerCount: number;
  /** « Buzzer »: id of the player who has the hand. */
  buzzerHolder?: string | null;
  /** TV theme (T40): lobby music, reveal and podium sounds. */
  theme?: QuizTheme;
}) {
  const prevPhase = useRef<GamePhase | null>(null);
  const prevCount = useRef<number | null>(null);
  const prevHolder = useRef<string | null | undefined>(undefined);

  // Before the phase effect, so the first lobby music is already the theme's.
  useEffect(() => setSoundTheme(theme), [theme]);

  useEffect(() => {
    const sound = phaseSound(prevPhase.current, phase);
    if (sound) playSound(sound);
    if (phase !== null) prevPhase.current = phase;
    loopSound(phase === 'LOBBY' ? 'lobby' : null);
  }, [phase]);

  useEffect(() => {
    if (phase === 'LOBBY' && prevCount.current !== null && playerCount > prevCount.current) {
      playSound('join');
    }
    if (phase !== null) prevCount.current = playerCount;
  }, [phase, playerCount]);

  useEffect(() => {
    if (shouldTick(phase, remainingSec)) playSound('tick');
  }, [phase, remainingSec]);

  useEffect(() => {
    if (shouldBuzz(prevHolder.current, buzzerHolder)) playSound('buzz');
    if (phase !== null) prevHolder.current = buzzerHolder;
  }, [phase, buzzerHolder]);

  useEffect(() => {
    if (resumeCount != null && resumeCount >= 1) playSound('tick');
  }, [resumeCount]);

  useEffect(() => stopAllSounds, []);
}
