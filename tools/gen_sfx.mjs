// Synthesise the game's sound effects into public/audio/sfx/*.wav.
// Run: node tools/gen_sfx.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'sfx');
const SR = 44100;
const TAU = Math.PI * 2;

let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rand() * 2 - 1;

function buf(sec) { return new Float32Array(Math.ceil(sec * SR)); }

/** Add a tone. f may be a function of t (seconds) for sweeps. */
function tone(out, { start = 0, dur, f, amp = 0.5, type = 'sine', attack = 0.005, decay = null, release = 0.05 }) {
  let phase = 0;
  const n0 = Math.floor(start * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && n0 + i < out.length; i++) {
    const t = i / SR;
    const freq = typeof f === 'function' ? f(t) : f;
    phase += TAU * freq / SR;
    let s;
    if (type === 'sine') s = Math.sin(phase);
    else if (type === 'tri') s = 2 / Math.PI * Math.asin(Math.sin(phase));
    else s = Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.15 * Math.sin(3 * phase);
    let env = Math.min(1, t / attack);
    if (decay) env *= Math.exp(-t / decay);
    const rem = dur - t;
    if (rem < release) env *= rem / release;
    out[n0 + i] += s * env * amp;
  }
}

/** Bell: inharmonic partials with fast decay on the high ones. */
function bell(out, start, f, amp = 0.4, len = 1.2) {
  [[1, 1, 0.9], [2.0, 0.5, 0.5], [2.76, 0.35, 0.3], [5.4, 0.15, 0.12], [8.93, 0.08, 0.06]].forEach(([m, a, d]) =>
    tone(out, { start, dur: len, f: f * m, amp: amp * a, decay: d * len, attack: 0.002 }));
}

function noiseBurst(out, { start = 0, dur, amp = 0.4, lp = 0.2, hp = 0, env = (t) => 1 }) {
  let low = 0, low2 = 0;
  const n0 = Math.floor(start * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && n0 + i < out.length; i++) {
    const t = i / SR;
    const k = typeof lp === 'function' ? lp(t) : lp;
    low += k * (noise() - low);
    low2 += 0.02 * (low - low2);
    const s = hp ? low - low2 : low;
    out[n0 + i] += s * amp * env(t / dur);
  }
}

function finish(out, gain = 0.9) {
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak ? gain / peak : 1;
  const fade = Math.min(400, out.length / 4);
  for (let i = 0; i < out.length; i++) {
    let v = out[i] * g;
    if (i < 32) v *= i / 32;
    if (i > out.length - fade) v *= (out.length - i) / fade;
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

function wav(name, data) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.round(v * 32767), 44 + i * 2));
  writeFileSync(join(OUT, name + '.wav'), b);
  console.log('wrote', name, (data.length / SR).toFixed(2) + 's');
}

const note = (n) => 440 * Math.pow(2, (n - 69) / 12);
const S = {};

// Correct letter: bubbly pop.
S.pop = (() => { const o = buf(0.2); tone(o, { dur: 0.16, f: (t) => 500 + 2200 * t / 0.16, amp: 0.6, decay: 0.06 }); noiseBurst(o, { dur: 0.02, amp: 0.2, lp: 0.5, env: (x) => 1 - x }); return finish(o, 0.8); })();
// Wrong key: soft, friendly boop.
S.boop = (() => { const o = buf(0.3); tone(o, { dur: 0.28, f: (t) => 300 - 90 * t, amp: 0.5, attack: 0.02, decay: 0.12 }); tone(o, { dur: 0.28, f: (t) => 600 - 180 * t, amp: 0.1, attack: 0.02, decay: 0.08 }); return finish(o, 0.55); })();
// Letter lands in slot.
S.thock = (() => { const o = buf(0.18); tone(o, { dur: 0.15, f: (t) => 220 - 300 * t, amp: 0.7, decay: 0.04 }); noiseBurst(o, { dur: 0.05, amp: 0.25, lp: 0.3, env: (x) => 1 - x }); return finish(o, 0.6); })();
// UI click.
S.click = (() => { const o = buf(0.12); tone(o, { dur: 0.1, f: (t) => 900 + 600 * t * 10, amp: 0.5, decay: 0.03 }); return finish(o, 0.6); })();
// Star chimes rising.
[72, 76, 79].forEach((n, i) => { S['star' + (i + 1)] = (() => { const o = buf(1.4); bell(o, 0, note(n + 12), 0.5, 1.3); bell(o, 0.08, note(n + 19), 0.2, 1.0); return finish(o, 0.75); })(); });
S.chime = S.star1;
// Sparkle: cluster of tiny high bells.
S.sparkle = (() => { const o = buf(0.9); for (let i = 0; i < 9; i++) bell(o, i * 0.07 + rand() * 0.03, note(88 + Math.floor(rand() * 12)), 0.18, 0.4); return finish(o, 0.5); })();
// Word complete: fast rainbow arpeggio.
S.magic = (() => { const o = buf(1.8); [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => bell(o, i * 0.07, note(n), 0.35, 1.0)); return finish(o, 0.75); })();
// Whoosh.
S.whoosh = (() => { const o = buf(0.7); noiseBurst(o, { dur: 0.7, amp: 1, lp: (t) => 0.02 + 0.25 * Math.sin(Math.PI * t / 0.7), hp: 1, env: (x) => Math.sin(Math.PI * x) }); return finish(o, 0.5); })();
// Rub loop (soft airy noise); volume is driven by wand speed in game.
S.rub = (() => { const o = buf(1.0); noiseBurst(o, { dur: 1.0, amp: 1, lp: 0.08, hp: 1 }); const f = 2000; for (let i = 0; i < f; i++) { const k = i / f; o[i] = o[i] * k + o[o.length - f + i] * (1 - k); } return finish(o.subarray(0, o.length - f), 0.4); })();
// Surprise: springy boing + sparkle.
S.boing = (() => { const o = buf(0.7); tone(o, { dur: 0.6, f: (t) => 300 + 500 * t + 60 * Math.sin(TAU * 14 * t) * Math.exp(-t * 4), amp: 0.5, decay: 0.3, type: 'tri' }); bell(o, 0.05, note(96), 0.15, 0.4); return finish(o, 0.65); })();
// Party popper.
S.popper = (() => { const o = buf(0.8); noiseBurst(o, { dur: 0.12, amp: 1, lp: 0.6, env: (x) => Math.pow(1 - x, 2) }); for (let i = 0; i < 14; i++) tone(o, { start: 0.08 + rand() * 0.5, dur: 0.05, f: 2000 + rand() * 3000, amp: 0.12, decay: 0.02 }); return finish(o, 0.7); })();
// Firework: rising whistle then crackle.
S.firework = (() => { const o = buf(1.6); tone(o, { dur: 0.55, f: (t) => 800 + 1400 * t, amp: 0.15, attack: 0.05 }); noiseBurst(o, { start: 0.55, dur: 0.25, amp: 1, lp: 0.3, env: (x) => Math.pow(1 - x, 3) }); for (let i = 0; i < 30; i++) noiseBurst(o, { start: 0.65 + rand() * 0.8, dur: 0.012, amp: 0.5, lp: 0.7, env: (x) => 1 - x }); return finish(o, 0.6); })();
// Fanfare jingle for level complete.
S.fanfare = (() => { const o = buf(2.4); const seq = [[72, 0, 0.18], [76, 0.18, 0.18], [79, 0.36, 0.18], [84, 0.54, 0.8], [79, 0.95, 0.15], [84, 1.1, 1.2]]; seq.forEach(([n, s, d]) => { tone(o, { start: s, dur: d + 0.2, f: note(n), amp: 0.35, type: 'soft', attack: 0.01, decay: 0.5 }); bell(o, s, note(n + 12), 0.2, 0.8); }); [60, 64, 67].forEach((n) => tone(o, { start: 1.1, dur: 1.2, f: note(n), amp: 0.12, type: 'soft', attack: 0.05, decay: 0.8 })); return finish(o, 0.8); })();
// World unlocked.
S.unlock = (() => { const o = buf(2.0); for (let i = 0; i < 16; i++) bell(o, i * 0.05, note(72 + i * 2), 0.25, 0.9); return finish(o, 0.7); })();
// Pip snore.
S.snore = (() => { const o = buf(2.2); noiseBurst(o, { dur: 1.1, amp: 1, lp: 0.03, env: (x) => Math.sin(Math.PI * x) * 0.8 }); tone(o, { dur: 1.1, f: (t) => 110 + 20 * Math.sin(TAU * 25 * t), amp: 0.1, attack: 0.2, release: 0.3 }); noiseBurst(o, { start: 1.2, dur: 0.9, amp: 0.6, lp: 0.08, hp: 1, env: (x) => Math.sin(Math.PI * x) }); return finish(o, 0.35); })();
// Page turn for the sticker book.
S.page = (() => { const o = buf(0.5); noiseBurst(o, { dur: 0.45, amp: 1, lp: (t) => 0.1 + 0.4 * t, hp: 1, env: (x) => Math.sin(Math.PI * Math.pow(x, 0.6)) }); return finish(o, 0.45); })();
// Sticker lands in the book.
S.sticker = (() => { const o = buf(0.9); tone(o, { dur: 0.1, f: (t) => 1200 - 4000 * t, amp: 0.4, decay: 0.04 }); bell(o, 0.08, note(91), 0.3, 0.7); bell(o, 0.16, note(96), 0.25, 0.7); return finish(o, 0.7); })();

// Background music: a soft music-box lullaby loop (C - Am - F - G), 90 BPM, 16 bars.
S.music = (() => {
  const beat = 60 / 90, bars = 16, len = bars * 4 * beat;
  const o = buf(len + 1.5);
  const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
  const melody = [76, 79, 81, 79, 76, 74, 72, 74, 76, 76, 74, 72, 74, 76, 79, 77, 76, 72, 74, 76, 72, 69, 72, 74, 72, 71, 72, 74, 79, 74, 71, 67];
  for (let bar = 0; bar < bars; bar++) {
    const ch = chords[bar % 4];
    const t0 = bar * 4 * beat;
    tone(o, { start: t0, dur: 4 * beat, f: note(ch[0] - 12), amp: 0.12, type: 'soft', attack: 0.02, decay: 1.2 });
    [0, 1, 2, 1, 0, 1, 2, 1].forEach((k, i) => bell(o, t0 + i * beat / 2, note(ch[k] + 12), 0.07, 0.9));
    for (let h = 0; h < 2; h++) {
      const m = melody[(bar * 2 + h) % melody.length];
      if (bar % 8 < 6 || h === 0) bell(o, t0 + h * 2 * beat + beat * 0.02, note(m), 0.16, 1.6);
    }
  }
  // Fold the tail back onto the start so the loop is seamless.
  const n = Math.floor(len * SR);
  for (let i = n; i < o.length; i++) o[i - n] += o[i];
  return finish(o.subarray(0, n), 0.55);
})();

mkdirSync(OUT, { recursive: true });
for (const [k, v] of Object.entries(S)) wav(k, v);
