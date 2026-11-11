// Generates the host-screen sound effects in `public/sounds/` (16-bit mono WAV).
// Every sound is synthesized from scratch by this script (sine/square/triangle tones and
// seeded noise), so the files are original works dedicated to the public domain (CC0) — see
// `public/sounds/CREDITS.md`. Run: `node apps/web/scripts/generate-sounds.mjs` (deterministic).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds');

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C4', 'A3'… → Hz */
const hz = (name) => midi(12 * (Number(name.slice(1)) + 1) + NOTE[name[0]]);

const waves = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
  saw: (p) => 2 * (p % 1) - 1,
  /** Drawbar organ: fundamental + octave + twelfth + double octave. */
  organ: (p) =>
    (Math.sin(2 * Math.PI * p) +
      0.6 * Math.sin(4 * Math.PI * p) +
      0.35 * Math.sin(6 * Math.PI * p) +
      0.25 * Math.sin(8 * Math.PI * p)) /
    2.2,
};

// Deterministic noise (mulberry32) so re-running the script gives identical files.
let seed = 0x1b0;
function noise() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

function buffer(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}

/** Adds a tone with an attack/exponential-decay envelope. `freq` may be a function of time. */
function tone(buf, start, dur, freq, { wave = 'sine', vol = 0.3, attack = 0.005, decay = 0 } = {}) {
  const from = Math.floor(start * RATE);
  const len = Math.floor(dur * RATE);
  let phase = 0;
  for (let i = 0; i < len && from + i < buf.length; i++) {
    const t = i / RATE;
    const f = typeof freq === 'function' ? freq(t) : freq;
    phase += f / RATE;
    const env =
      Math.min(1, t / attack) *
      (decay > 0 ? Math.exp(-t / decay) : 1) *
      Math.min(1, (dur - t) / 0.02); // short release: no clicks
    buf[from + i] += waves[wave](phase) * vol * env;
  }
}

function noiseBurst(buf, start, dur, { vol = 0.2, decay = 0.05 } = {}) {
  const from = Math.floor(start * RATE);
  for (let i = 0; i < dur * RATE && from + i < buf.length; i++) {
    const t = i / RATE;
    buf[from + i] += noise() * vol * Math.exp(-t / decay) * Math.min(1, (dur - t) / 0.01);
  }
}

function kick(buf, start) {
  tone(buf, start, 0.18, (t) => 50 + 110 * Math.exp(-t / 0.03), { vol: 0.5, decay: 0.08 });
}

function save(name, buf) {
  const peak = buf.reduce((m, s) => Math.max(m, Math.abs(s)), 1e-9);
  const gain = Math.min(1, 0.9 / peak);
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((s, i) => data.writeInt16LE(Math.round(s * gain * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(OUT, `${name}.wav`), Buffer.concat([header, data]));
  console.log(`${name}.wav  ${(buf.length / RATE).toFixed(2)} s`);
}

mkdirSync(OUT, { recursive: true });

// ---- lobby: seamless 8 s loop, 120 bpm, C – Am – F – G ----
{
  const beat = 0.5;
  const buf = buffer(16 * beat);
  const chords = [
    ['C3', ['C4', 'E4', 'G4', 'C5']],
    ['A2', ['A3', 'C4', 'E4', 'A4']],
    ['F2', ['F3', 'A3', 'C4', 'F4']],
    ['G2', ['G3', 'B3', 'D4', 'G4']],
  ];
  const arp = [0, 1, 2, 3, 2, 1, 2, 3];
  chords.forEach(([bass, notes], bar) => {
    const t0 = bar * 4 * beat;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      tone(buf, t, beat * 0.9, hz(bass), { wave: 'triangle', vol: 0.35, decay: 0.25 });
      if (b % 2 === 0) kick(buf, t);
      else noiseBurst(buf, t, 0.08, { vol: 0.12, decay: 0.02 });
      noiseBurst(buf, t + beat / 2, 0.04, { vol: 0.05, decay: 0.01 }); // off-beat hi-hat
    }
    arp.forEach((n, i) => {
      tone(buf, t0 + i * (beat / 2), beat / 2, hz(notes[n]), {
        wave: 'square',
        vol: 0.06,
        decay: 0.12,
      });
    });
  });
  // Melody (one note per beat, `-` = rest).
  const melody = 'E5 G5 C6 G5 C5 E5 A5 - F5 A5 C6 A5 D5 G5 B5 -'.split(' ');
  melody.forEach((n, i) => {
    if (n !== '-') tone(buf, i * beat, beat * 0.8, hz(n), { vol: 0.14, decay: 0.3 });
  });
  save('lobby', buf);
}

// ---- join: bubbly pop when a player joins ----
{
  const buf = buffer(0.16);
  tone(buf, 0, 0.15, (t) => 500 + 5000 * t, { vol: 0.5, decay: 0.05 });
  save('join', buf);
}

// ---- tick: woodblock tick for the last seconds of the countdown ----
{
  const buf = buffer(0.08);
  tone(buf, 0, 0.08, 1700, { vol: 0.6, attack: 0.001, decay: 0.015 });
  tone(buf, 0, 0.08, 850, { wave: 'triangle', vol: 0.3, attack: 0.001, decay: 0.02 });
  save('tick', buf);
}

// ---- reveal: "ta-da" ----
{
  const buf = buffer(1.3);
  noiseBurst(buf, 0, 0.3, { vol: 0.25, decay: 0.1 });
  tone(buf, 0, 0.12, hz('G4'), { wave: 'square', vol: 0.12, decay: 0.08 });
  tone(buf, 0.12, 0.12, hz('C5'), { wave: 'square', vol: 0.12, decay: 0.08 });
  for (const n of ['C5', 'E5', 'G5', 'C6']) {
    tone(buf, 0.26, 1.0, hz(n), { wave: 'triangle', vol: 0.18, decay: 0.45 });
  }
  save('reveal', buf);
}

// ---- podium: drum roll while 3rd and 2nd rise (≈ 3.2 s), then a fanfare for the winner ----
{
  const buf = buffer(5.2);
  const rollEnd = 3.15;
  for (let t = 0; t < rollEnd; t += 0.045) {
    noiseBurst(buf, t, 0.05, { vol: 0.08 + 0.17 * (t / rollEnd), decay: 0.02 });
  }
  kick(buf, 0.8); // 3rd place lands
  kick(buf, 2.0); // 2nd place lands
  const hit = 3.2;
  kick(buf, hit);
  noiseBurst(buf, hit, 1.4, { vol: 0.25, decay: 0.4 }); // cymbal
  const fanfare = [
    ['G4', 0, 0.15],
    ['C5', 0.15, 0.15],
    ['E5', 0.3, 0.15],
    ['G5', 0.45, 1.5],
  ];
  for (const [n, at, d] of fanfare) {
    tone(buf, hit + at, d, hz(n), { wave: 'square', vol: 0.1, decay: d > 1 ? 0.8 : 0.2 });
  }
  for (const n of ['C4', 'E4', 'G4', 'C5', 'E5']) {
    tone(buf, hit + 0.45, 1.5, hz(n), { wave: 'triangle', vol: 0.12, decay: 0.8 });
  }
  save('podium', buf);
}

// ---- joker: magic whoosh + sparkly arpeggio when a player plays a joker ----
{
  const buf = buffer(0.9);
  tone(buf, 0, 0.35, (t) => 300 + 2400 * (t / 0.35) ** 2, {
    wave: 'triangle',
    vol: 0.18,
    decay: 0.3,
  });
  noiseBurst(buf, 0, 0.35, { vol: 0.08, decay: 0.15 });
  ['E6', 'G6', 'B6', 'E7'].forEach((n, i) => {
    tone(buf, 0.3 + i * 0.07, 0.45, hz(n), { vol: 0.16, decay: 0.15 });
  });
  save('joker', buf);
}

// ---- eliminated: « dun dun duuun » + a low rumble when a player loses their last heart ----
{
  const buf = buffer(2.2);
  [
    ['D3', 0, 0.28],
    ['D3', 0.34, 0.28],
    ['A2', 0.7, 1.4],
  ].forEach(([n, start, dur]) => {
    tone(buf, start, dur, hz(n), { wave: 'square', vol: 0.09, decay: dur * 0.8 });
    tone(buf, start, dur, hz(n) / 2, { wave: 'triangle', vol: 0.25, decay: dur * 0.8 });
  });
  // The last note slides down, like a ghost leaving.
  tone(buf, 0.7, 1.4, (t) => hz('A3') * 2 ** (-t / 1.4), { vol: 0.08, decay: 0.8 });
  noiseBurst(buf, 0.7, 0.9, { vol: 0.07, decay: 0.4 });
  save('eliminated', buf);
}

// ---- buzz: game-show buzzer when a player takes the hand (« Buzzer » questions) ----
{
  const buf = buffer(0.75);
  // Two detuned square waves a fifth apart, with a quick vibrato: the classic « BZZZ ».
  for (const [freq, vol] of [
    [hz('G3'), 0.11],
    [hz('D4'), 0.08],
    [hz('G3') * 1.01, 0.08],
  ]) {
    tone(buf, 0, 0.7, (t) => freq * (1 + 0.012 * Math.sin(2 * Math.PI * 28 * t)), {
      wave: 'square',
      vol,
      attack: 0.01,
    });
  }
  tone(buf, 0, 0.12, hz('G5'), { vol: 0.2, decay: 0.05 }); // bright attack
  save('buzz', buf);
}

// ======== TV themes (T40): lobby loop + reveal sting + podium fanfare per theme ========
// Same lengths and timings as the classic files (8 s loop; podium hit at 3.2 s). Appended after
// the classic sounds so the shared noise seed leaves those files unchanged.

/** Several notes at once. */
function chord(buf, start, dur, notes, opts) {
  for (const n of notes) tone(buf, start, dur, hz(n), opts);
}

/** Podium build-up shared by the themes: a roll until 3.15 s, with the 3rd / 2nd landings. */
function podiumRoll(buf, roll) {
  const rollEnd = 3.15;
  for (let t = 0; t < rollEnd; t += 0.045) roll(t, t / rollEnd);
  kick(buf, 0.8);
  kick(buf, 2.0);
  kick(buf, 3.2);
}

/** Sleigh bells: a cluster of short inharmonic high tones + a little noise. */
function bells(buf, start, vol = 0.05) {
  for (const f of [2637, 3520, 4186, 5274]) {
    tone(buf, start + 0.002 * (1 + noise()), 0.09, f * (1 + 0.003 * noise()), {
      vol,
      attack: 0.001,
      decay: 0.03,
    });
  }
  noiseBurst(buf, start, 0.05, { vol: vol * 0.8, decay: 0.015 });
}

// ---- Halloween: spooky organ in D minor ----
{
  const beat = 0.5;
  const buf = buffer(16 * beat);
  const bars = [
    ['D2', ['D4', 'F4', 'A4']],
    ['A1', ['D4', 'F4', 'A4']],
    ['G1', ['D4', 'G4', 'A4']],
    ['A1', ['C4', 'E4', 'A4']],
  ];
  bars.forEach(([bass, notes], bar) => {
    const t0 = bar * 4 * beat;
    chord(buf, t0, 4 * beat - 0.02, notes, { wave: 'organ', vol: 0.09, attack: 0.08 });
    tone(buf, t0, 2 * beat, hz(bass), { wave: 'organ', vol: 0.3, attack: 0.03 });
    tone(buf, t0 + 2 * beat, 2 * beat - 0.02, hz(bass), { wave: 'organ', vol: 0.25 });
    kick(buf, t0);
    kick(buf, t0 + 2 * beat);
  });
  // Creeping melody with a tremolo (one note per beat, `-` = rest).
  const melody = 'A5 G5 F5 E5 F5 D5 - - D5 F5 A5 G5 E5 C5 - E5'.split(' ');
  melody.forEach((n, i) => {
    if (n === '-') return;
    tone(buf, i * beat, beat * 0.95, (t) => hz(n) * (1 + 0.006 * Math.sin(2 * Math.PI * 6 * t)), {
      wave: 'organ',
      vol: 0.13,
      attack: 0.02,
    });
  });
  save('lobby-halloween', buf);
}
{
  const buf = buffer(1.3);
  noiseBurst(buf, 0, 0.5, { vol: 0.15, decay: 0.2 }); // thunder-ish
  tone(buf, 0, 0.15, hz('A4'), { wave: 'organ', vol: 0.2 });
  tone(buf, 0.15, 0.15, hz('E5'), { wave: 'organ', vol: 0.2 });
  chord(buf, 0.3, 1.0, ['D4', 'F4', 'A4', 'D5'], { wave: 'organ', vol: 0.16, decay: 0.6 });
  tone(buf, 0.3, 1.0, hz('D2'), { wave: 'organ', vol: 0.3, decay: 0.6 });
  save('reveal-halloween', buf);
}
{
  const buf = buffer(5.2);
  podiumRoll(buf, (t, k) =>
    tone(buf, t, 0.06, hz('D2'), { wave: 'organ', vol: 0.1 + 0.2 * k, decay: 0.03 }),
  );
  const hit = 3.2;
  noiseBurst(buf, hit, 1.4, { vol: 0.2, decay: 0.4 });
  [
    ['A4', 0, 0.15],
    ['D5', 0.15, 0.15],
    ['F5', 0.3, 0.15],
    ['A5', 0.45, 1.5],
  ].forEach(([n, at, d]) => tone(buf, hit + at, d, hz(n), { wave: 'organ', vol: 0.18 }));
  chord(buf, hit + 0.45, 1.5, ['D3', 'D4', 'F4', 'A4'], { wave: 'organ', vol: 0.14, decay: 1.2 });
  save('podium-halloween', buf);
}

// ---- Noël: sleigh bells + glockenspiel in G major ----
{
  const beat = 0.5;
  const buf = buffer(16 * beat);
  const bars = [
    ['G2', ['G4', 'B4', 'D5']],
    ['E2', ['E4', 'G4', 'B4']],
    ['C3', ['C4', 'E4', 'G4']],
    ['D3', ['D4', 'A4', 'C5']],
  ];
  bars.forEach(([bass, notes], bar) => {
    const t0 = bar * 4 * beat;
    for (let b = 0; b < 4; b++) {
      tone(buf, t0 + b * beat, beat * 0.9, hz(bass), { wave: 'triangle', vol: 0.3, decay: 0.3 });
      chord(buf, t0 + b * beat + beat / 2, beat * 0.4, notes, {
        wave: 'triangle',
        vol: 0.04,
        decay: 0.15,
      });
    }
  });
  for (let i = 0; i < 32; i++) bells(buf, i * (beat / 2), i % 2 ? 0.03 : 0.05);
  const melody = 'B5 B5 D6 B5 G5 A5 B5 - C6 E6 D6 B5 A5 G5 A5 -'.split(' ');
  melody.forEach((n, i) => {
    if (n !== '-') tone(buf, i * beat, beat * 0.9, hz(n), { vol: 0.16, attack: 0.002, decay: 0.2 });
  });
  save('lobby-christmas', buf);
}
{
  const buf = buffer(1.3);
  for (let i = 0; i < 6; i++) bells(buf, i * 0.04, 0.06);
  ['G5', 'B5', 'D6', 'G6'].forEach((n, i) =>
    tone(buf, 0.05 * i, 0.6, hz(n), { vol: 0.15, attack: 0.002, decay: 0.25 }),
  );
  chord(buf, 0.3, 1.0, ['G4', 'B4', 'D5', 'G5'], { wave: 'triangle', vol: 0.15, decay: 0.45 });
  save('reveal-christmas', buf);
}
{
  const buf = buffer(5.2);
  podiumRoll(buf, (t, k) => bells(buf, t, 0.015 + 0.04 * k));
  const hit = 3.2;
  for (let i = 0; i < 12; i++) bells(buf, hit + i * 0.12, 0.05 * Math.exp(-i / 6));
  [
    ['D5', 0, 0.15],
    ['G5', 0.15, 0.15],
    ['B5', 0.3, 0.15],
    ['D6', 0.45, 1.5],
  ].forEach(([n, at, d]) =>
    tone(buf, hit + at, d, hz(n), { vol: 0.2, attack: 0.002, decay: d > 1 ? 0.7 : 0.15 }),
  );
  chord(buf, hit + 0.45, 1.5, ['G3', 'G4', 'B4', 'D5'], {
    wave: 'triangle',
    vol: 0.13,
    decay: 0.8,
  });
  save('podium-christmas', buf);
}

// ---- Rétro: 8-bit chiptune in A minor ----
{
  const beat = 0.5;
  const buf = buffer(16 * beat);
  const bars = [
    ['A2', ['A4', 'C5', 'E5']],
    ['F2', ['F4', 'A4', 'C5']],
    ['C3', ['C5', 'E5', 'G5']],
    ['G2', ['G4', 'B4', 'D5']],
  ];
  bars.forEach(([bass, notes], bar) => {
    const t0 = bar * 4 * beat;
    // Fast arpeggio (16ths) and an octave-jumping bass (8ths), noise drums.
    for (let i = 0; i < 16; i++) {
      tone(buf, t0 + i * (beat / 4), beat / 4, hz(notes[i % 3]), {
        wave: 'square',
        vol: 0.045,
        decay: 0.06,
      });
    }
    for (let i = 0; i < 8; i++) {
      tone(buf, t0 + i * (beat / 2), beat / 2 - 0.02, hz(bass) * (i % 2 ? 2 : 1), {
        wave: 'triangle',
        vol: 0.3,
      });
    }
    for (let b = 0; b < 4; b++) {
      noiseBurst(buf, t0 + b * beat, b % 2 ? 0.1 : 0.05, {
        vol: b % 2 ? 0.14 : 0.1,
        decay: b % 2 ? 0.04 : 0.01,
      });
    }
  });
  const melody = 'E5 - A5 B5 C6 B5 A5 G5 A5 - - E5 G5 F5 D5 -'.split(' ');
  melody.forEach((n, i) => {
    if (n !== '-') tone(buf, i * beat, beat * 0.85, hz(n), { wave: 'square', vol: 0.09 });
  });
  save('lobby-retro', buf);
}
{
  const buf = buffer(1.3);
  ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) =>
    tone(buf, i * 0.045, 0.05, hz(n), { wave: 'square', vol: 0.12 }),
  );
  tone(buf, 0.32, 0.9, hz('C6'), { wave: 'square', vol: 0.1, decay: 0.4 });
  tone(buf, 0.32, 0.9, hz('G5'), { wave: 'square', vol: 0.07, decay: 0.4 });
  tone(buf, 0.32, 0.9, hz('C3'), { wave: 'triangle', vol: 0.3, decay: 0.4 });
  save('reveal-retro', buf);
}
{
  const buf = buffer(5.2);
  podiumRoll(buf, (t, k) => noiseBurst(buf, t, 0.04, { vol: 0.05 + 0.15 * k, decay: 0.012 }));
  const hit = 3.2;
  [
    ['C5', 0, 0.12],
    ['C5', 0.12, 0.12],
    ['C5', 0.24, 0.12],
    ['G5', 0.36, 0.3],
    ['E5', 0.66, 0.15],
    ['C6', 0.81, 1.2],
  ].forEach(([n, at, d]) => tone(buf, hit + at, d, hz(n), { wave: 'square', vol: 0.11 }));
  tone(buf, hit + 0.81, 1.2, hz('C3'), { wave: 'triangle', vol: 0.3, decay: 0.8 });
  noiseBurst(buf, hit, 0.6, { vol: 0.15, decay: 0.2 });
  save('podium-retro', buf);
}

// ---- Espace: slow synth pad + echoing arpeggio ----
{
  const beat = 0.5;
  const buf = buffer(16 * beat);
  const bars = [
    ['C2', ['C4', 'E4', 'G4', 'B4']],
    ['A1', ['A3', 'C4', 'E4', 'B4']],
    ['F1', ['F3', 'A3', 'C4', 'E4']],
    ['G1', ['G3', 'B3', 'D4', 'E4']],
  ];
  bars.forEach(([bass, notes], bar) => {
    const t0 = bar * 4 * beat;
    for (const n of notes) {
      // Two detuned saws per note: a wide, soft pad.
      for (const d of [0.996, 1.004]) {
        tone(buf, t0, 4 * beat - 0.02, hz(n) * d, { wave: 'saw', vol: 0.022, attack: 0.5 });
      }
    }
    tone(buf, t0, 4 * beat - 0.02, hz(bass), { vol: 0.3, attack: 0.2 });
    [0, 1, 2, 3, 2, 1, 2, 3].forEach((k, i) => {
      const at = t0 + i * (beat / 2);
      tone(buf, at, 0.3, hz(notes[k]) * 2, { vol: 0.07, decay: 0.1 });
      tone(buf, at + 0.375, 0.3, hz(notes[k]) * 2, { vol: 0.025, decay: 0.1 }); // echo
    });
  });
  save('lobby-space', buf);
}
{
  const buf = buffer(1.3);
  tone(buf, 0, 0.4, (t) => 200 * 2 ** (t * 12), { wave: 'saw', vol: 0.05, attack: 0.05 });
  chord(buf, 0.3, 1.0, ['C4', 'G4', 'C5', 'E5'], { wave: 'saw', vol: 0.04, decay: 0.5 });
  ['C6', 'E6', 'G6', 'C7'].forEach((n, i) =>
    tone(buf, 0.3 + i * 0.08, 0.6, hz(n), { vol: 0.1, decay: 0.2 }),
  );
  save('reveal-space', buf);
}
{
  const buf = buffer(5.2);
  podiumRoll(buf, (t, k) =>
    tone(buf, t, 0.05, 300 + 900 * k, { vol: 0.04 + 0.06 * k, decay: 0.02 }),
  );
  const hit = 3.2;
  noiseBurst(buf, hit, 1.6, { vol: 0.12, decay: 0.6 });
  for (const n of ['C3', 'G3', 'C4', 'E4', 'G4', 'C5']) {
    for (const d of [0.995, 1.005]) {
      tone(buf, hit, 2.0, hz(n) * d, { wave: 'saw', vol: 0.03, attack: 0.05, decay: 1.2 });
    }
  }
  ['G5', 'C6', 'E6', 'G6'].forEach((n, i) =>
    tone(buf, hit + 0.1 * i, 1.2, hz(n), { vol: 0.12, decay: 0.4 }),
  );
  save('podium-space', buf);
}

// ======== « Patate chaude » (T63): the bomb's tick and its explosion ========
// Appended last so the shared noise seed leaves every file above unchanged.

// ---- potato-tick: a short, dry clock tick (played faster and faster by the TV) ----
{
  const buf = buffer(0.12);
  tone(buf, 0, 0.05, hz('E6'), { wave: 'square', vol: 0.12, decay: 0.012 });
  tone(buf, 0, 0.08, hz('E5'), { wave: 'triangle', vol: 0.25, decay: 0.02 });
  noiseBurst(buf, 0, 0.03, { vol: 0.12, decay: 0.006 });
  save('potato-tick', buf);
}

// ---- potato-boom: a big explosion — noise blast, falling rumble, low thump ----
{
  const buf = buffer(2.4);
  noiseBurst(buf, 0, 2.3, { vol: 0.5, decay: 0.45 });
  noiseBurst(buf, 0, 0.25, { vol: 0.4, decay: 0.05 });
  tone(buf, 0, 1.6, (t) => 90 * Math.exp(-t / 0.5) + 30, { vol: 0.6, decay: 0.5 });
  tone(buf, 0, 0.4, (t) => 160 * Math.exp(-t / 0.08) + 40, { vol: 0.5, decay: 0.12 });
  save('potato-boom', buf);
}
