import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GamePhase, QuizTheme } from '@lbq/shared';
import { getTheme, type ThemedSound } from '../themes';

/** Host screen only — phones never play sounds. Files and licenses: `public/sounds/CREDITS.md`. */
export type SoundName =
  | 'lobby'
  | 'join'
  | 'tick'
  | 'reveal'
  | 'podium'
  | 'joker'
  | 'eliminated'
  | 'buzz'
  | 'potato-tick'
  | 'potato-boom';

const VOLUME: Record<SoundName, number> = {
  lobby: 0.45,
  join: 0.6,
  tick: 0.7,
  reveal: 0.8,
  podium: 0.9,
  joker: 0.7,
  eliminated: 0.8,
  buzz: 0.8,
  'potato-tick': 0.6,
  'potato-boom': 0.9,
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

/**
 * Volume levels of the TV (T41), 0–1: « Musique et effets » (every sound of this file) and
 * « Extraits du quiz » (the question's sound clip, `clipPlayer.ts`). « Tout couper » is `muted`.
 */
export interface SoundLevels {
  music: number;
  clips: number;
}

export const DEFAULT_LEVELS: SoundLevels = { music: 1, clips: 1 };

const LEVEL_KEYS: Record<keyof SoundLevels, string> = {
  music: 'lbq:host:music-volume',
  clips: 'lbq:host:clip-volume',
};

/** A stored level (0–100); missing / unreadable / out of range → 100 %. */
export function readLevels(storage: Pick<Storage, 'getItem'> | undefined): SoundLevels {
  const read = (key: string, fallback: number) => {
    try {
      const raw = storage?.getItem(key);
      const value = raw == null || raw === '' ? NaN : Number(raw);
      return Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    music: read(LEVEL_KEYS.music, DEFAULT_LEVELS.music),
    clips: read(LEVEL_KEYS.clips, DEFAULT_LEVELS.clips),
  };
}

export function writeLevels(storage: Pick<Storage, 'setItem'> | undefined, levels: SoundLevels) {
  try {
    storage?.setItem(LEVEL_KEYS.music, String(Math.round(levels.music * 100)));
    storage?.setItem(LEVEL_KEYS.clips, String(Math.round(levels.clips * 100)));
  } catch {
    // Not remembered, but the sliders still work for this page.
  }
}

function localStorageOrUndefined(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Background music of the TV: `radio` = the theme's ambiance radio (`radio.ts`, default),
 * `game` = the built-in lobby music only.
 */
export type Ambiance = 'radio' | 'game';
const AMBIANCE_KEY = 'lbq:host:ambiance';

/** Without a stored choice: the radio (`VITE_DEFAULT_AMBIANCE=game` for offline e2e runs). */
const DEFAULT_AMBIANCE: Ambiance =
  import.meta.env.VITE_DEFAULT_AMBIANCE === 'game' ? 'game' : 'radio';

export function readAmbiance(
  storage: Pick<Storage, 'getItem'> | undefined,
  fallback: Ambiance = DEFAULT_AMBIANCE,
): Ambiance {
  try {
    const value = storage?.getItem(AMBIANCE_KEY);
    return value === 'game' || value === 'radio' ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeAmbiance(storage: Pick<Storage, 'setItem'> | undefined, value: Ambiance) {
  try {
    storage?.setItem(AMBIANCE_KEY, value);
  } catch {
    // Not remembered, but the choice still works for this page.
  }
}

// ---------- Player (module-level: one host screen per tab) ----------

/** Read lazily: touching `localStorage` at import time warns under Node (unit tests). */
let muted: boolean | null = null;
const isMuted = () => (muted ??= readMuted(localStorageOrUndefined()));
let levels: SoundLevels | null = null;
const getLevels = () => (levels ??= readLevels(localStorageOrUndefined()));
/** The game sounds are silent: everything cut, or the music level at 0. */
const musicSilent = () => isMuted() || getLevels().music === 0;
const listeners = new Set<() => void>();
let ambiance: Ambiance | null = null;
const getAmbiance = () => (ambiance ??= readAmbiance(localStorageOrUndefined()));
/** The radio stream failed on this page (offline, station down): back to the game music. */
let radioFailed = false;
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
  el.volume = (volumes.get(el) ?? 1) * getLevels().music * (ducked ? DUCK_FACTOR : 1);
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
  if (musicSilent() || typeof Audio === 'undefined') return;
  const el = element(name);
  el.loop = true;
  if (el.paused) tryPlay(el);
}

export function playSound(name: SoundName) {
  if (musicSilent() || typeof Audio === 'undefined') return;
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

/** Pauses or restarts the game sounds after « Tout couper » / the music level changed. */
function applySilence() {
  if (musicSilent()) for (const el of elements.values()) el.pause();
  else if (wantedLoop) startLoop(wantedLoop);
}

export function setMuted(value: boolean) {
  muted = value;
  writeMuted(localStorageOrUndefined(), value);
  applySilence();
  listeners.forEach((l) => l());
}

/** Sets one or both levels (0–1), remembered in `localStorage`, applied live. */
export function setLevels(change: Partial<SoundLevels>) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const prev = getLevels();
  levels = {
    music: clamp(change.music ?? prev.music),
    clips: clamp(change.clips ?? prev.clips),
  };
  writeLevels(localStorageOrUndefined(), levels);
  for (const el of elements.values()) applyVolume(el);
  applySilence();
  listeners.forEach((l) => l());
}

export function setAmbiance(value: Ambiance) {
  ambiance = value;
  radioFailed = false; // choosing the radio again retries it
  writeAmbiance(localStorageOrUndefined(), value);
  listeners.forEach((l) => l());
}

/** Called by the radio player when its stream can't be played. */
export function setRadioFailed(value: boolean) {
  if (radioFailed === value) return;
  radioFailed = value;
  listeners.forEach((l) => l());
}

export function useAmbiance(): Ambiance {
  return useSyncExternalStore(subscribe, getAmbiance);
}

export function useRadioFailed(): boolean {
  return useSyncExternalStore(subscribe, () => radioFailed);
}

/** Current levels (outside React). */
export const getSoundLevels = (): SoundLevels => getLevels();

/** Step of the remote's « Musique − / + ». */
export const MUSIC_STEP = 0.2;

/** One « − / + » step, rounded to the step so 100 % → 80 % → … → 0 % → 20 %. */
export function stepLevel(level: number, up: boolean): number {
  const steps = Math.round(level / MUSIC_STEP) + (up ? 1 : -1);
  return Math.min(1, Math.max(0, Math.round(steps * MUSIC_STEP * 100) / 100));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, isMuted);
}

export function useSoundLevels(): SoundLevels {
  return useSyncExternalStore(subscribe, getLevels);
}

// ---------- Game → sounds ----------

/** Seconds at the end of ANSWERING that tick. */
export const TICK_FROM_SEC = 5;

/**
 * Which one-shot sound a phase change triggers (none when the screen is first shown). `potato`:
 * a « Patate chaude » round — its reveal is the explosion.
 */
export function phaseSound(
  prev: GamePhase | null,
  next: GamePhase | null,
  potato = false,
): SoundName | null {
  if (prev === null || prev === next) return null; // first state after a (re)load: no replay
  if (next === 'REVEAL') return potato ? 'potato-boom' : 'reveal';
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
  radio = false,
  potato = false,
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
  /** The theme's radio is the background music: no lobby loop. */
  radio?: boolean;
  /** The current question is a « Patate chaude » round (its reveal = the explosion). */
  potato?: boolean;
}) {
  const prevPhase = useRef<GamePhase | null>(null);
  const prevCount = useRef<number | null>(null);
  const prevHolder = useRef<string | null | undefined>(undefined);

  // Before the phase effect, so the first lobby music is already the theme's.
  useEffect(() => setSoundTheme(theme), [theme]);

  useEffect(() => {
    const sound = phaseSound(prevPhase.current, phase, potato);
    if (sound) playSound(sound);
    if (phase !== null) prevPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    loopSound(phase === 'LOBBY' && !radio ? 'lobby' : null);
  }, [phase, radio]);

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
