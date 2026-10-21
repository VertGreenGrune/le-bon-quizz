import { useCallback, useEffect, useRef } from 'react';
import type { GamePhase, QuestionAudio, QuestionShowPayload } from '@lbq/shared';
import { setDucked, useMuted } from './sounds';

/** The part of `HTMLAudioElement` the clip player uses (a fake one in the unit tests). */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly paused: boolean;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'timeupdate' | 'ended' | 'loadedmetadata', fn: () => void): void;
}

export type ClipMode = 'playing' | 'paused' | 'stopped';

export interface ClipWish {
  /** One playthrough: a new key starts the excerpt again from its start. */
  key: string;
  clip: QuestionAudio;
  mode: ClipMode;
  /** Loop the excerpt (while answering) or play it once (at the reveal). */
  loop: boolean;
}

/**
 * Plays the excerpt [startSec, startSec + durationSec] of a question's sound on the host
 * screen. Declarative: `update()` says what should happen now (from the game state), the
 * player keeps the position across a pause and restarts on a new key.
 */
export class ClipPlayer {
  private el: AudioLike | null = null;
  private wish: ClipWish | null = null;
  private muted = false;
  /** A one-shot clip (reveal) reached its end: don't restart it until `replay()`. */
  private finished = false;
  private wasPlaying = false;
  private unlockPending = false;

  constructor(
    private readonly createAudio: () => AudioLike,
    /** Called when the clip starts / stops sounding (to duck the other host sounds). */
    private readonly onPlayingChange: (playing: boolean) => void = () => {},
  ) {}

  get playing(): boolean {
    return this.wasPlaying;
  }

  update(wish: ClipWish | null, muted: boolean): void {
    const prev = this.wish;
    this.wish = wish && wish.mode !== 'stopped' ? wish : null;
    this.muted = muted;
    if (this.wish && (prev?.key !== this.wish.key || prev.clip.url !== this.wish.clip.url)) {
      this.load(this.wish.clip);
    }
    this.apply();
  }

  /** « Rejouer »: back to the start of the excerpt (plays only if the clip may play now). */
  replay(): void {
    if (!this.wish || !this.el) return;
    this.el.currentTime = this.wish.clip.startSec;
    this.finished = false;
    this.apply();
  }

  dispose(): void {
    this.update(null, this.muted);
  }

  private load(clip: QuestionAudio) {
    if (!this.el) {
      const el = this.createAudio();
      el.preload = 'auto';
      el.addEventListener('timeupdate', () => this.onTime(false));
      el.addEventListener('ended', () => this.onTime(true));
      // Some browsers ignore a seek before the metadata is known: seek again.
      el.addEventListener('loadedmetadata', () => {
        const start = this.wish?.clip.startSec ?? 0;
        if (el.currentTime < start - 0.25) el.currentTime = start;
      });
      this.el = el;
    }
    if (this.el.src !== clip.url) this.el.src = clip.url;
    this.el.currentTime = clip.startSec;
    this.finished = false;
  }

  private apply() {
    const el = this.el;
    const shouldPlay = !!this.wish && this.wish.mode === 'playing' && !this.muted && !this.finished;
    if (el) {
      if (shouldPlay && el.paused) this.tryPlay(el);
      else if (!shouldPlay && !el.paused) el.pause();
    }
    if (shouldPlay !== this.wasPlaying) {
      this.wasPlaying = shouldPlay;
      this.onPlayingChange(shouldPlay);
    }
  }

  private onTime(ended: boolean) {
    const el = this.el;
    const wish = this.wish;
    if (!el || !wish || wish.mode !== 'playing') return;
    const end = wish.clip.startSec + wish.clip.durationSec;
    if (!ended && el.currentTime < end) return;
    if (wish.loop) {
      el.currentTime = wish.clip.startSec;
      if (el.paused) this.tryPlay(el); // the file was shorter than the excerpt
    } else {
      this.finished = true;
      this.apply();
    }
  }

  private tryPlay(el: AudioLike) {
    el.play().catch((err: unknown) => {
      // Autoplay blocked (host page reloaded, no click yet): retry on the first click / key.
      if (!(err instanceof DOMException && err.name === 'NotAllowedError')) return;
      if (this.unlockPending || typeof window === 'undefined') return;
      this.unlockPending = true;
      const unlock = () => {
        this.unlockPending = false;
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        if (this.wasPlaying && this.el?.paused) void this.el.play().catch(() => {});
      };
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
    });
  }
}

/**
 * What the question's clip should do in this phase: during ANSWERING (looped, paused with the
 * game until the 3-2-1 is over), or once at REVEAL with `audioOnReveal`; stopped otherwise.
 */
export function clipWish(
  question: QuestionShowPayload | null,
  phase: GamePhase | null,
  paused: boolean,
): ClipWish | null {
  if (!question?.audio) return null;
  const playPhase: GamePhase = question.audioOnReveal ? 'REVEAL' : 'ANSWERING';
  if (phase !== playPhase) return null;
  return {
    key: `${question.index}/${playPhase}`,
    clip: question.audio,
    mode: paused ? 'paused' : 'playing',
    loop: !question.audioOnReveal,
  };
}

/** A hidden `<audio>` in the page (so it can be inspected, e.g. by the e2e test). */
function createClipElement(): HTMLAudioElement {
  const el = new Audio();
  el.hidden = true;
  el.dataset.testid = 'question-clip';
  document.body.appendChild(el);
  return el;
}

/** Plays the current question's sound clip on the host screen; returns « Rejouer ». */
export function useQuestionClip(
  question: QuestionShowPayload | null,
  phase: GamePhase | null,
  paused: boolean,
): { replay: () => void } {
  const muted = useMuted();
  const player = useRef<ClipPlayer | null>(null);
  if (typeof Audio !== 'undefined') {
    player.current ??= new ClipPlayer(createClipElement, setDucked);
  }
  const wish = clipWish(question, phase, paused);
  // Compared by value: a new (equal) wish object on every render must not restart anything.
  const wishJson = JSON.stringify(wish);

  useEffect(() => {
    player.current?.update(JSON.parse(wishJson) as ClipWish | null, muted);
  }, [wishJson, muted]);

  useEffect(() => () => player.current?.dispose(), []);

  return { replay: useCallback(() => player.current?.replay(), []) };
}
