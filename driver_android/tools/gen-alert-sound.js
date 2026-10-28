#!/usr/bin/env node
/**
 * Generates app/src/main/res/raw/new_job_alert.wav — the loud "new delivery job"
 * notification tone. Run with plain Node (no deps):
 *
 *   node tools/gen-alert-sound.js
 *
 * The repo keeps no hand-authored binaries; regenerate the wav from this script
 * whenever the tone needs tweaking, then rebuild the app. NOTE: the notification
 * channel caches its sound at creation time, so bump the channel id in
 * BcNotifications.kt (e.g. bc_new_job_v2) if you change this file.
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

/** One chime: two rising notes (A5 -> D6) with a bright 2nd harmonic. */
function chime(out, startSec, gain) {
  tone(out, startSec, 0.16, 880.0, gain);
  tone(out, startSec + 0.18, 0.26, 1174.66, gain);
}

function tone(out, startSec, durSec, freq, gain) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const n = Math.floor(durSec * SAMPLE_RATE);
  const attack = Math.floor(n * 0.06);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Fast attack, exponential-ish decay so notes ring like a bell.
    const env = i < attack ? i / attack : Math.pow(1 - (i - attack) / (n - attack), 1.6);
    const s =
      Math.sin(2 * Math.PI * freq * t) * 1.0 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.35 +
      Math.sin(2 * Math.PI * freq * 3 * t) * 0.12;
    out[start + i] += s * env * gain;
  }
}

const TOTAL_SEC = 2.1;
const samples = new Float64Array(Math.ceil(TOTAL_SEC * SAMPLE_RATE));

// Three chimes, slightly louder each time so it cuts through road noise.
chime(samples, 0.0, 0.5);
chime(samples, 0.62, 0.58);
chime(samples, 1.24, 0.66);

// Normalize to ~ -1 dBFS.
let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
const norm = peak > 0 ? 0.89 / peak : 1;

const pcm = Buffer.alloc(samples.length * 2);
for (let i = 0; i < samples.length; i++) {
  const v = Math.max(-1, Math.min(1, samples[i] * norm));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}

// 16-bit mono PCM WAV container.
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);           // fmt chunk size
header.writeUInt16LE(1, 20);            // PCM
header.writeUInt16LE(1, 22);            // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32);            // block align
header.writeUInt16LE(16, 34);           // bits per sample
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const outDir = path.join(__dirname, '..', 'app', 'src', 'main', 'res', 'raw');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'new_job_alert.wav');
fs.writeFileSync(outFile, Buffer.concat([header, pcm]));
console.log(`Wrote ${outFile} (${((header.length + pcm.length) / 1024).toFixed(1)} KB, ${TOTAL_SEC}s)`);
