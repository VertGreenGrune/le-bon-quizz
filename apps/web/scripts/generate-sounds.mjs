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
