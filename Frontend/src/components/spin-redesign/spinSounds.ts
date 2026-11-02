"use client";

import { getAudioContext } from "@/lib/uiSounds";

/**
 * Browsers only let a page start making sound during a click, so the Spin Now click calls this, before it waits for
 * the server; the ticks and the chime later play on the context woken up here. Until then every sound is silent.
 */
export function wakeSpinAudio() {
  const audio = getAudioContext();
  if (audio?.state === "suspended") void audio.resume();
}

const running = () => {
  const audio = getAudioContext();
  return audio?.state === "running" ? audio : null;
};

/** One short note: `type` wave gliding from `fromHz` to `toHz`, up to `volume`, fading out over `length` seconds. */
function note(context: AudioContext, start: number, { fromHz, toHz = fromHz, volume, length, type = "sine" }: { fromHz: number; toHz?: number; volume: number; length: number; type?: OscillatorType }) {
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.type = type;
  tone.frequency.setValueAtTime(fromHz, start);
  if (toHz !== fromHz) tone.frequency.exponentialRampToValueAtTime(toHz, start + length * 0.6);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  tone.connect(gain).connect(context.destination);
  tone.start(start);
  tone.stop(start + length + 0.02);
}

/** The pointer's click as a slice edge passes it: a tiny, quiet tick (about 30ms). */
export function playSpinTick() {
  const audio = running();
  if (!audio) return;
  note(audio, audio.currentTime, { fromHz: 2400, toHz: 1300, volume: 0.05, length: 0.03, type: "triangle" });
}

/** A win: a bright rising arpeggio (C, E, G, high C), the last note ringing a little longer. */
export function playSpinWin() {
  const audio = running();
  if (!audio) return;
  const now = audio.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => note(audio, now + i * 0.09, { fromHz: hz, volume: 0.12, length: i === 3 ? 0.7 : 0.3, type: "triangle" }));
}

/** Try Again: two soft falling notes, an "aww". */
export function playSpinMiss() {
  const audio = running();
  if (!audio) return;
  const now = audio.currentTime;
  note(audio, now, { fromHz: 392, toHz: 370, volume: 0.07, length: 0.28 });
  note(audio, now + 0.2, { fromHz: 311, toHz: 262, volume: 0.07, length: 0.5 });
}
