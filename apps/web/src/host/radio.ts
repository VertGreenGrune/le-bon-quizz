import { useEffect, useRef } from 'react';
import type { GamePhase, QuestionShowPayload } from '@lbq/shared';
import { getTheme } from '../themes';
import { setRadioFailed, useAmbiance, useMuted, useRadioFailed, useSoundLevels } from './sounds';

/**
 * « 📻 Radio du thème »: the TV plays the theme's free radio station (SomaFM) the whole game,
 * quieter while a question is on screen, and **silent when the question has a sound to
 * listen to** (blind test: from the intro to the end of ANSWERING; `audioOnReveal`: at the
 * reveal). The station failing (offline TV, station down) falls back to the game music.
 */

/** Radio level relative to « Musique et effets » (the station is mastered loud). */
export const RADIO_VOLUME = 0.5;
/** Extra factor while a question is on screen (QUESTION_INTRO / ANSWERING). */
export const QUESTION_RADIO_FACTOR = 0.5;
/** No sound this long after `play()` → the stream is considered down. */
export const RADIO_START_TIMEOUT_MS = 12_000;

/** How loud the radio should be now, as a factor of the music level (0 = stopped). */
export function radioFactor(
  phase: GamePhase | null,
  question: Pick<QuestionShowPayload, 'audio' | 'audioOnReveal'> | null,
): number {
  if (phase === null || phase === 'ENDED') return 0;
  const questionPhase = phase === 'QUESTION_INTRO' || phase === 'ANSWERING';
  if (question?.audio) {
    if (question.audioOnReveal ? phase === 'REVEAL' : questionPhase) return 0;
  }
  return RADIO_VOLUME * (questionPhase ? QUESTION_RADIO_FACTOR : 1);
}

/** The part of `HTMLAudioElement` the radio uses (a fake one in the unit tests). */
export interface StreamLike {
  src: string;
  volume: number;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: 'playing' | 'error', fn: () => void): void;
}

/**
 * Plays one live stream. Declarative: `update(url, volume)` says what should be heard now;
 * volume 0 / no url stops the stream (and its download) — starting again joins the live
 * broadcast instead of resuming minutes late.
 */
export class RadioPlayer {
  private el: StreamLike | null = null;
  private url: string | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private unlockPending = false;

  constructor(
    private readonly createStream: () => StreamLike,
    private readonly onFail: () => void,
  ) {}

  get playingUrl(): string | null {
    return this.url;
  }

  update(url: string | null, volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    if (!url || v === 0) return this.stop();
    const el = (this.el ??= this.createListening());
    el.volume = v;
    if (this.url === url) return;
    this.url = url;
    el.src = url;
    this.start(el);
  }

  stop(): void {
    this.clearTimeout();
    if (!this.el || this.url === null) return;
    this.url = null;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load(); // drops the connection to the stream
  }

  dispose(): void {
    this.stop();
  }

  private createListening(): StreamLike {
    const el = this.createStream();
    el.preload = 'none';
    el.addEventListener('playing', () => this.clearTimeout());
    el.addEventListener('error', () => {
      if (this.url !== null) this.fail();
    });
    return el;
  }

  private start(el: StreamLike) {
    this.clearTimeout();
    this.timeout = setTimeout(() => this.fail(), RADIO_START_TIMEOUT_MS);
    el.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        // Autoplay blocked: retried on the first gesture; not a failure of the station.
        this.clearTimeout();
        this.waitForUnlock();
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        // Interrupted by a newer src / stop(): nothing to do.
      } else this.fail();
    });
  }

  private fail() {
    this.stop();
    this.onFail();
  }

  private clearTimeout() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private waitForUnlock() {
    if (this.unlockPending || typeof window === 'undefined') return;
    this.unlockPending = true;
    const unlock = () => {
      this.unlockPending = false;
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      if (this.el && this.url) this.start(this.el);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }
}

function createStreamElement(): StreamLike {
  const el = new Audio();
  el.hidden = true;
  el.dataset.testid = 'theme-radio';
  document.body.appendChild(el);
  return el;
}

/**
 * Drives the theme radio of the host screen. Returns whether the radio is the background music
 * (so the built-in lobby loop stays off).
 */
export function useThemeRadio(
  phase: GamePhase | null,
  question: QuestionShowPayload | null,
  theme: string | undefined,
): boolean {
  const ambiance = useAmbiance();
  const failed = useRadioFailed();
  const muted = useMuted();
  const { music } = useSoundLevels();
  const player = useRef<RadioPlayer | null>(null);
  if (typeof Audio !== 'undefined') {
    player.current ??= new RadioPlayer(createStreamElement, () => setRadioFailed(true));
  }
  const on = ambiance === 'radio' && !failed;
  const url = getTheme(theme).radio.url;
  const volume = on && !muted ? music * radioFactor(phase, question) : 0;

  useEffect(() => {
    player.current?.update(on ? url : null, volume);
  }, [on, url, volume]);

  useEffect(() => () => player.current?.dispose(), []);
  return on;
}
