#!/usr/bin/env node
/**
 * Generates app/src/main/res/raw/order_cancelled_alert.wav — a descending
 * cancellation tone, distinct from the rising new-job chimes. Run with plain Node:
 *
 *   node tools/gen-cancel-sound.js
 *
 * DriverAlertService plays this clip itself (the cancel notification channel is
 * silent), so no channel-id bump is needed after regenerating.
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function tone(out, startSec, durSec, freq, gain) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const n = Math.floor(durSec * SAMPLE_RATE);
  const attack = Math.floor(n * 0.04);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = i < attack ? i / attack : Math.pow(1 - (i - attack) / (n - attack), 1.35);
    const s =
      Math.sin(2 * Math.PI * freq * t) * 1.0 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.22 +
      Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.18;
    out[start + i] += s * env * gain;
  }
}

/** One descending triplet: G5 -> D5 -> A4. Sounds like a stop was pulled. */
function cancelPhrase(out, startSec, gain) {
  tone(out, startSec, 0.22, 783.99, gain);
  tone(out, startSec + 0.20, 0.26, 587.33, gain * 1.05);
  tone(out, startSec + 0.44, 0.38, 440.0, gain * 1.12);
}

const TOTAL_SEC = 1.85;
const samples = new Float64Array(Math.ceil(TOTAL_SEC * SAMPLE_RATE));

cancelPhrase(samples, 0.0, 0.52);
cancelPhrase(samples, 0.95, 0.62);

let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
const norm = peak > 0 ? 0.89 / peak : 1;

const pcm = Buffer.alloc(samples.length * 2);
for (let i = 0; i < samples.length; i++) {
  const v = Math.max(-1, Math.min(1, samples[i] * norm));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const outDir = path.join(__dirname, '..', 'app', 'src', 'main', 'res', 'raw');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'order_cancelled_alert.wav');
fs.writeFileSync(outFile, Buffer.concat([header, pcm]));
console.log(`Wrote ${outFile} (${((header.length + pcm.length) / 1024).toFixed(1)} KB, ${TOTAL_SEC}s)`);
