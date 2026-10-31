import { describe, expect, it } from 'vitest';
import type { QuestionShowPayload } from '@lbq/shared';
import { ClipPlayer, clipWish, type AudioLike, type ClipWish } from './clipPlayer';

/** A fake `<audio>`: `advance()` moves the playback position like the browser would. */
class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  volume = 1;
  paused = true;
  preload = '';
  plays = 0;
  private listeners = new Map<string, (() => void)[]>();
  play() {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
  advance(sec: number) {
    if (this.paused) return;
    this.currentTime += sec;
    this.emit('timeupdate');
  }
}

const clip = { url: 'http://h/uploads/a.mp3', startSec: 30, durationSec: 10 };
const wish = (patch: Partial<ClipWish> = {}): ClipWish => ({
  key: '0/ANSWERING',
  clip,
  mode: 'playing',
  loop: true,
  ...patch,
});

function setup() {
  const audio = new FakeAudio();
  const ducked: boolean[] = [];
  const player = new ClipPlayer(
    () => audio,
    (playing) => ducked.push(playing),
  );
  return { audio, player, ducked };
}

describe('ClipPlayer', () => {
  it('plays the excerpt from its start and loops it while answering', () => {
    const { audio, player, ducked } = setup();
    player.update(wish(), false);
    expect(audio.src).toBe(clip.url);
    expect(audio.currentTime).toBe(30);
    expect(audio.paused).toBe(false);
    expect(ducked).toEqual([true]);
    audio.advance(9.5);
    expect(audio.currentTime).toBe(39.5);
    audio.advance(0.6); // past startSec + durationSec
    expect(audio.currentTime).toBe(30);
    expect(audio.paused).toBe(false);
    // The file ends before the excerpt does: start again too.
    audio.paused = true;
    audio.emit('ended');
    expect(audio.currentTime).toBe(30);
    expect(audio.paused).toBe(false);
  });

  it('pauses with the game and resumes where it was', () => {
    const { audio, player, ducked } = setup();
    player.update(wish(), false);
    audio.advance(4);
    player.update(wish({ mode: 'paused' }), false);
    expect(audio.paused).toBe(true);
    audio.advance(3); // paused: doesn't move
    player.update(wish(), false); // after the 3-2-1
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(34);
    expect(ducked).toEqual([true, false, true]);
  });

  it('stops at the reveal, and a new question starts from its own excerpt start', () => {
    const { audio, player, ducked } = setup();
    player.update(wish(), false);
    audio.advance(5);
    player.update(null, false);
    expect(audio.paused).toBe(true);
    expect(ducked.at(-1)).toBe(false);
    player.update(wish({ key: '1/ANSWERING', clip: { ...clip, startSec: 2 } }), false);
    expect(audio.currentTime).toBe(2);
    expect(audio.paused).toBe(false);
  });

  it('follows the mute toggle', () => {
    const { audio, player } = setup();
    player.update(wish(), true);
    expect(audio.paused).toBe(true);
    expect(player.playing).toBe(false);
    player.update(wish(), false);
    expect(audio.paused).toBe(false);
    player.update(wish(), true);
    expect(audio.paused).toBe(true);
  });

  it('follows the « Extraits du quiz » level, 0 = silent without ducking the music', () => {
    const { audio, player, ducked } = setup();
    player.update(wish(), false, 0.4);
    expect(audio.volume).toBe(0.4);
    expect(audio.paused).toBe(false);
    player.update(wish(), false, 0.7);
    expect(audio.volume).toBe(0.7);
    audio.advance(2);
    player.update(wish(), false, 0);
    expect(audio.paused).toBe(true);
    expect(ducked).toEqual([true, false]);
    player.update(wish(), false, 1);
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(32);
  });

  it('at the reveal, plays once; « Rejouer » starts it again', () => {
    const { audio, player } = setup();
    player.update(wish({ key: '0/REVEAL', loop: false }), false);
    audio.advance(10.2);
    expect(audio.paused).toBe(true);
    player.update(wish({ key: '0/REVEAL', loop: false }), false); // re-render: no restart
    expect(audio.paused).toBe(true);
    player.replay();
    expect(audio.currentTime).toBe(30);
    expect(audio.paused).toBe(false);
  });

  it('« Rejouer » while answering restarts the excerpt, but not during a pause', () => {
    const { audio, player } = setup();
    player.update(wish(), false);
    audio.advance(6);
    player.replay();
    expect(audio.currentTime).toBe(30);
    expect(audio.paused).toBe(false);
    player.update(wish({ mode: 'paused' }), false);
    player.replay();
    expect(audio.paused).toBe(true);
  });
});

describe('clipWish', () => {
  const question = (patch: Partial<QuestionShowPayload> = {}): QuestionShowPayload => ({
    index: 2,
    type: 'MCQ',
    text: 'Q',
    choices: ['a', 'b'],
    timeLimitSec: 20,
    audio: clip,
    ...patch,
  });

  it('plays during ANSWERING only, paused with the game', () => {
    expect(clipWish(question(), 'QUESTION_INTRO', false)).toBeNull();
    expect(clipWish(question(), 'ANSWERING', false)).toEqual({
      key: '2/ANSWERING',
      clip,
      mode: 'playing',
      loop: true,
    });
    expect(clipWish(question(), 'ANSWERING', true)?.mode).toBe('paused');
    expect(clipWish(question(), 'REVEAL', false)).toBeNull();
    expect(clipWish(question({ audio: undefined }), 'ANSWERING', false)).toBeNull();
    expect(clipWish(null, 'ANSWERING', false)).toBeNull();
  });

  it('audioOnReveal: once at REVEAL instead', () => {
    const q = question({ audioOnReveal: true });
    expect(clipWish(q, 'ANSWERING', false)).toBeNull();
    expect(clipWish(q, 'REVEAL', false)).toMatchObject({ key: '2/REVEAL', loop: false });
    expect(clipWish(q, 'LEADERBOARD', false)).toBeNull();
  });
});
