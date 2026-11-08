import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIZ_THEMES } from '@lbq/shared';
import { getTheme } from '../themes';
import {
  QUESTION_RADIO_FACTOR,
  RADIO_START_TIMEOUT_MS,
  RADIO_VOLUME,
  RadioPlayer,
  radioFactor,
  type StreamLike,
} from './radio';
import { readAmbiance, writeAmbiance } from './sounds';

class FakeStream implements StreamLike {
  src = '';
  volume = 1;
  preload = '';
  paused = true;
  plays = 0;
  loads = 0;
  rejectWith: unknown = null;
  private listeners = new Map<string, (() => void)[]>();
  play() {
    this.plays++;
    if (this.rejectWith) return Promise.reject(this.rejectWith);
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loads++;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
}

const URL_A = 'https://ice2.somafm.com/doomed-128-mp3';
const URL_B = 'https://ice2.somafm.com/u80s-128-mp3';
const blindTest = { audio: { url: 'x', startSec: 0, durationSec: 15 } };

describe('radioFactor', () => {
  it('plays everywhere, quieter while a question is on screen', () => {
    expect(radioFactor('LOBBY', null)).toBe(RADIO_VOLUME);
    expect(radioFactor('QUESTION_INTRO', {})).toBe(RADIO_VOLUME * QUESTION_RADIO_FACTOR);
    expect(radioFactor('ANSWERING', {})).toBe(RADIO_VOLUME * QUESTION_RADIO_FACTOR);
    expect(radioFactor('REVEAL', {})).toBe(RADIO_VOLUME);
    expect(radioFactor('LEADERBOARD', {})).toBe(RADIO_VOLUME);
    expect(radioFactor('PODIUM', {})).toBe(RADIO_VOLUME);
  });

  it('is silent when the question has a sound to listen to', () => {
    expect(radioFactor('QUESTION_INTRO', blindTest)).toBe(0);
    expect(radioFactor('ANSWERING', blindTest)).toBe(0);
    expect(radioFactor('REVEAL', blindTest)).toBe(RADIO_VOLUME);
    const onReveal = { ...blindTest, audioOnReveal: true as const };
    expect(radioFactor('ANSWERING', onReveal)).toBe(RADIO_VOLUME * QUESTION_RADIO_FACTOR);
    expect(radioFactor('REVEAL', onReveal)).toBe(0);
    expect(radioFactor('LEADERBOARD', onReveal)).toBe(RADIO_VOLUME);
  });

  it('is off before the first state and once the game ended', () => {
    expect(radioFactor(null, null)).toBe(0);
    expect(radioFactor('ENDED', null)).toBe(0);
  });
});

describe('RadioPlayer', () => {
  let stream: FakeStream;
  let onFail: ReturnType<typeof vi.fn<() => void>>;
  let player: RadioPlayer;
  beforeEach(() => {
    vi.useFakeTimers();
    stream = new FakeStream();
    onFail = vi.fn<() => void>();
    player = new RadioPlayer(() => stream, onFail);
  });
  afterEach(() => vi.useRealTimers());

  it('starts the stream once, then only changes the volume', () => {
    player.update(URL_A, 0.5);
    expect(stream).toMatchObject({ src: URL_A, volume: 0.5, preload: 'none', plays: 1 });
    player.update(URL_A, 0.25);
    expect(stream).toMatchObject({ volume: 0.25, plays: 1 });
  });

  it('volume 0 stops the stream and drops the connection; back on = live again', () => {
    player.update(URL_A, 0.5);
    player.update(URL_A, 0);
    expect(stream.paused).toBe(true);
    expect(stream.src).toBe('');
    expect(stream.loads).toBe(1);
    expect(player.playingUrl).toBeNull();
    player.update(URL_A, 0.5);
    expect(stream).toMatchObject({ src: URL_A, plays: 2 });
  });

  it('switches station with the theme', () => {
    player.update(URL_A, 0.5);
    player.update(URL_B, 0.5);
    expect(stream).toMatchObject({ src: URL_B, plays: 2 });
  });

  it('fails when the stream errors or never starts', async () => {
    player.update(URL_A, 0.5);
    stream.emit('playing');
    vi.advanceTimersByTime(RADIO_START_TIMEOUT_MS * 2);
    expect(onFail).not.toHaveBeenCalled();
    stream.emit('error');
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(player.playingUrl).toBeNull();

    player.update(URL_B, 0.5); // never plays
    vi.advanceTimersByTime(RADIO_START_TIMEOUT_MS);
    expect(onFail).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it('an autoplay refusal is not a failure: retried on the first gesture', async () => {
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('window', {
      addEventListener: (t: string, fn: () => void) => (listeners[t] = fn),
      removeEventListener: () => {},
    });
    stream.rejectWith = new DOMException('blocked', 'NotAllowedError');
    player.update(URL_A, 0.5);
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(RADIO_START_TIMEOUT_MS * 2);
    expect(onFail).not.toHaveBeenCalled();
    stream.rejectWith = null;
    listeners.pointerdown!();
    expect(stream.plays).toBe(2);
    vi.unstubAllGlobals();
  });
});

describe('ambiance choice', () => {
  it('defaults to the radio, remembers « musique du jeu »', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(readAmbiance(storage, 'radio')).toBe('radio');
    expect(readAmbiance(storage, 'game')).toBe('game');
    writeAmbiance(storage, 'game');
    expect(readAmbiance(storage, 'radio')).toBe('game');
    expect(readAmbiance(undefined, 'radio')).toBe('radio');
  });

  it('every theme has an HTTPS SomaFM station', () => {
    for (const id of QUIZ_THEMES) {
      const { radio } = getTheme(id);
      expect(radio.name).toBeTruthy();
      expect(radio.url).toMatch(/^https:\/\/ice\d\.somafm\.com\/[a-z0-9]+-128-mp3$/);
    }
  });
});
