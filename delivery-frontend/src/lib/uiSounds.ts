let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function resumeAudio(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

/** Call once after a user gesture on admin pages so order chimes can play. */
export function primeBranchOrderAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);
}

/** Short UI click for confirm actions */
export function playConfirmClickSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;

  const click = ctx.createOscillator();
  const gain = ctx.createGain();
  click.type = 'sine';
  click.frequency.setValueAtTime(620, t);
  click.frequency.exponentialRampToValueAtTime(880, t + 0.04);
  click.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.22, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  click.start(t);
  click.stop(t + 0.1);

  const tap = ctx.createOscillator();
  const tapGain = ctx.createGain();
  tap.type = 'triangle';
  tap.frequency.setValueAtTime(1200, t + 0.02);
  tap.connect(tapGain);
  tapGain.connect(ctx.destination);
  tapGain.gain.setValueAtTime(0, t + 0.02);
  tapGain.gain.linearRampToValueAtTime(0.08, t + 0.03);
  tapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  tap.start(t + 0.02);
  tap.stop(t + 0.08);
}

/** Cheerful pop + ding when an item lands in the cart */
export function playCartAddSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;

  const pop = ctx.createOscillator();
  const popGain = ctx.createGain();
  pop.type = 'sine';
  pop.frequency.setValueAtTime(440, t);
  pop.frequency.exponentialRampToValueAtTime(784, t + 0.1);
  pop.connect(popGain);
  popGain.connect(ctx.destination);
  popGain.gain.setValueAtTime(0, t);
  popGain.gain.linearRampToValueAtTime(0.28, t + 0.015);
  popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  pop.start(t);
  pop.stop(t + 0.24);

  const ding = ctx.createOscillator();
  const dingGain = ctx.createGain();
  ding.type = 'triangle';
  ding.frequency.setValueAtTime(988, t + 0.06);
  ding.connect(dingGain);
  dingGain.connect(ctx.destination);
  dingGain.gain.setValueAtTime(0, t + 0.06);
  dingGain.gain.linearRampToValueAtTime(0.18, t + 0.08);
  dingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  ding.start(t + 0.06);
  ding.stop(t + 0.4);
}

/** Warm whoosh when user picks Delivery or Takeaway */
export function playModeSelectSound(mode: 'DELIVERY' | 'TAKEAWAY' = 'DELIVERY'): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;
  const base = mode === 'DELIVERY' ? 392 : 440;
  const peak = mode === 'DELIVERY' ? 587.33 : 659.25;

  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = 'sine';
  sweep.frequency.setValueAtTime(base, t);
  sweep.frequency.exponentialRampToValueAtTime(peak, t + 0.12);
  sweep.connect(sweepGain);
  sweepGain.connect(ctx.destination);
  sweepGain.gain.setValueAtTime(0, t);
  sweepGain.gain.linearRampToValueAtTime(0.2, t + 0.02);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  sweep.start(t);
  sweep.stop(t + 0.3);

  const chime = ctx.createOscillator();
  const chimeGain = ctx.createGain();
  chime.type = 'triangle';
  chime.frequency.setValueAtTime(peak * 1.5, t + 0.1);
  chime.connect(chimeGain);
  chimeGain.connect(ctx.destination);
  chimeGain.gain.setValueAtTime(0, t + 0.1);
  chimeGain.gain.linearRampToValueAtTime(0.12, t + 0.12);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  chime.start(t + 0.1);
  chime.stop(t + 0.38);
}

/** Soft pin drop when map marker / address updates */
export function playLocationPinSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;
  const pin = ctx.createOscillator();
  const gain = ctx.createGain();
  pin.type = 'sine';
  pin.frequency.setValueAtTime(280, t);
  pin.frequency.exponentialRampToValueAtTime(180, t + 0.08);
  pin.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  pin.start(t);
  pin.stop(t + 0.16);

  const tick = ctx.createOscillator();
  const tickGain = ctx.createGain();
  tick.type = 'triangle';
  tick.frequency.setValueAtTime(520, t + 0.04);
  tick.connect(tickGain);
  tickGain.connect(ctx.destination);
  tickGain.gain.setValueAtTime(0, t + 0.04);
  tickGain.gain.linearRampToValueAtTime(0.06, t + 0.05);
  tickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  tick.start(t + 0.04);
  tick.stop(t + 0.12);
}

/** Quick success beep when a QR code is scanned */
export function playQrScanSuccessSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;

  const ping = ctx.createOscillator();
  const pingGain = ctx.createGain();
  ping.type = 'sine';
  ping.frequency.setValueAtTime(880, t);
  ping.frequency.exponentialRampToValueAtTime(1174.66, t + 0.06);
  ping.connect(pingGain);
  pingGain.connect(ctx.destination);
  pingGain.gain.setValueAtTime(0, t);
  pingGain.gain.linearRampToValueAtTime(0.24, t + 0.01);
  pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  ping.start(t);
  ping.stop(t + 0.2);

  const blip = ctx.createOscillator();
  const blipGain = ctx.createGain();
  blip.type = 'triangle';
  blip.frequency.setValueAtTime(1318.51, t + 0.08);
  blip.connect(blipGain);
  blipGain.connect(ctx.destination);
  blipGain.gain.setValueAtTime(0, t + 0.08);
  blipGain.gain.linearRampToValueAtTime(0.12, t + 0.1);
  blipGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  blip.start(t + 0.08);
  blip.stop(t + 0.24);
}

/** Triumphant fanfare when an order is confirmed */
export function playOrderConfirmedSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
  const gaps = [0, 0.1, 0.2, 0.32, 0.48];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i < 3 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, t + gaps[i]);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = t + gaps[i];
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22 - i * 0.02, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.start(start);
    osc.stop(start + 0.5);
  });

  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();
  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(1567.98, t + 0.55);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(ctx.destination);
  shimmerGain.gain.setValueAtTime(0, t + 0.55);
  shimmerGain.gain.linearRampToValueAtTime(0.12, t + 0.58);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  shimmer.start(t + 0.55);
  shimmer.stop(t + 1.15);
}

/** Victory fanfare when a delivery order arrives or takeaway is ready */
export function playOrderDeliveredSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;
  const victory = [
    { freq: 392, at: 0, vol: 0.2 },
    { freq: 523.25, at: 0.1, vol: 0.22 },
    { freq: 659.25, at: 0.2, vol: 0.24 },
    { freq: 783.99, at: 0.32, vol: 0.26 },
    { freq: 1046.5, at: 0.46, vol: 0.28 },
    { freq: 1318.51, at: 0.62, vol: 0.3 },
  ];

  victory.forEach(({ freq, at, vol }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = at < 0.32 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, t + at);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = t + at;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
    osc.start(start);
    osc.stop(start + 0.58);
  });

  [0.78, 0.92, 1.06].forEach((at, i) => {
    const ding = ctx.createOscillator();
    const dingGain = ctx.createGain();
    ding.type = 'sine';
    ding.frequency.setValueAtTime(1760 + i * 110, t + at);
    ding.connect(dingGain);
    dingGain.connect(ctx.destination);
    dingGain.gain.setValueAtTime(0, t + at);
    dingGain.gain.linearRampToValueAtTime(0.14, t + at + 0.015);
    dingGain.gain.exponentialRampToValueAtTime(0.001, t + at + 0.22);
    ding.start(t + at);
    ding.stop(t + at + 0.24);
  });

  const swell = ctx.createOscillator();
  const swellGain = ctx.createGain();
  swell.type = 'sine';
  swell.frequency.setValueAtTime(196, t);
  swell.frequency.exponentialRampToValueAtTime(392, t + 0.8);
  swell.connect(swellGain);
  swellGain.connect(ctx.destination);
  swellGain.gain.setValueAtTime(0, t);
  swellGain.gain.linearRampToValueAtTime(0.08, t + 0.15);
  swellGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  swell.start(t);
  swell.stop(t + 1.25);
}

/** Alert chime for branch admin / cashier when a new order arrives */
export function playBranchNewOrderSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const play = () => {
    const t = ctx.currentTime;
    const chimes = [
      { freq: 880, at: 0, vol: 0.28 },
      { freq: 1108.73, at: 0.12, vol: 0.3 },
      { freq: 1318.51, at: 0.24, vol: 0.32 },
      { freq: 1760, at: 0.38, vol: 0.28 },
    ];

    chimes.forEach(({ freq, at, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + at);
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = t + at;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.38);
    });
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(play).catch(() => undefined);
    return;
  }

  play();
}

let branchAlertLoopTimer: ReturnType<typeof setInterval> | null = null;

/** Repeats the new-order chime until stopBranchNewOrderAlertLoop() is called. */
export function startBranchNewOrderAlertLoop(): void {
  stopBranchNewOrderAlertLoop();
  primeBranchOrderAudio();
  playBranchNewOrderSound();
  branchAlertLoopTimer = setInterval(() => {
    playBranchNewOrderSound();
  }, 2500);
}

export function stopBranchNewOrderAlertLoop(): void {
  if (branchAlertLoopTimer !== null) {
    clearInterval(branchAlertLoopTimer);
    branchAlertLoopTimer = null;
  }
}

let vehicleFailureAlertLoopTimer: ReturnType<typeof setInterval> | null = null;

/** Repeats the new-order chime until the delivery admin dismisses every bike-failure card. */
export function startVehicleFailureAlertLoop(): void {
  stopVehicleFailureAlertLoop();
  primeBranchOrderAudio();
  playBranchNewOrderSound();
  vehicleFailureAlertLoopTimer = setInterval(() => {
    playBranchNewOrderSound();
  }, 2500);
}

export function stopVehicleFailureAlertLoop(): void {
  if (vehicleFailureAlertLoopTimer !== null) {
    clearInterval(vehicleFailureAlertLoopTimer);
    vehicleFailureAlertLoopTimer = null;
  }
}

/** Unlock audio on the spin-button tap so wheel ticks can play. */
export function primeSpinAudio(): void {
  primeBranchOrderAudio();
}

function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, t: number): number {
  let x = t;
  for (let i = 0; i < 8; i++) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const current = ((ax * x + bx) * x + cx) * x;
    const dx = (3 * ax * x + 2 * bx) * x + cx;
    if (Math.abs(dx) < 1e-6) break;
    x -= (current - t) / dx;
  }
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return ((ay * x + by) * x + cy) * x;
}

function playSpinTick(ctx: AudioContext, volume: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1680, t);
  osc.frequency.exponentialRampToValueAtTime(720, t + 0.038);
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.start(t);
  osc.stop(t + 0.055);
}

let spinSoundGen = 0;
let spinRaf = 0;
let spinWhoosh: OscillatorNode | null = null;
let spinWhooshGain: GainNode | null = null;

export function stopSpinWheelSound(): void {
  spinSoundGen += 1;
  if (spinRaf) {
    cancelAnimationFrame(spinRaf);
    spinRaf = 0;
  }
  if (spinWhoosh) {
    try {
      spinWhoosh.stop();
    } catch {
      /* already stopped */
    }
    spinWhoosh.disconnect();
    spinWhoosh = null;
  }
  if (spinWhooshGain) {
    spinWhooshGain.disconnect();
    spinWhooshGain = null;
  }
}

/** Clicker ticks that slow with the wheel, plus a soft rumble. */
export function startSpinWheelSound(options: {
  durationMs: number;
  segmentCount: number;
  extraTurns: number;
}): void {
  stopSpinWheelSound();
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const durationMs = Math.max(400, options.durationMs);
  const segments = Math.max(options.segmentCount, 1);
  const extraTurns = Math.max(1, options.extraTurns);
  const totalDegrees = extraTurns * 360 + 180;
  const step = 360 / segments;
  const gen = spinSoundGen;
  const startedAt = performance.now();

  const t0 = ctx.currentTime;
  const rumble = ctx.createOscillator();
  const rumbleGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(88, t0);
  rumble.frequency.exponentialRampToValueAtTime(42, t0 + durationMs / 1000);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(420, t0);
  filter.frequency.exponentialRampToValueAtTime(110, t0 + durationMs / 1000);
  rumble.connect(filter);
  filter.connect(rumbleGain);
  rumbleGain.connect(ctx.destination);
  rumbleGain.gain.setValueAtTime(0, t0);
  rumbleGain.gain.linearRampToValueAtTime(0.045, t0 + 0.08);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000);
  rumble.start(t0);
  rumble.stop(t0 + durationMs / 1000 + 0.05);
  spinWhoosh = rumble;
  spinWhooshGain = rumbleGain;

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(520, t0);
  click.frequency.exponentialRampToValueAtTime(980, t0 + 0.08);
  click.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickGain.gain.setValueAtTime(0, t0);
  clickGain.gain.linearRampToValueAtTime(0.2, t0 + 0.012);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
  click.start(t0);
  click.stop(t0 + 0.18);

  let lastSegment = -1;

  const loop = () => {
    if (gen !== spinSoundGen) return;
    const elapsed = performance.now() - startedAt;
    const linear = Math.min(elapsed / durationMs, 1);
    const eased = cubicBezierEase(0.08, 0.22, 0.12, 1, linear);
    const degrees = eased * totalDegrees;
    const segment = Math.floor(degrees / step);
    if (segment > lastSegment) {
      lastSegment = segment;
      const volume = 0.06 + (1 - linear) * 0.12;
      playSpinTick(ctx, volume);
    }
    if (linear < 1) {
      spinRaf = requestAnimationFrame(loop);
    } else {
      spinRaf = 0;
    }
  };

  spinRaf = requestAnimationFrame(loop);
}

/** Prize fanfare when the wheel lands on a win. */
export function playSpinWinSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i < 2 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = t + i * 0.09;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.24 - i * 0.02, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
    osc.start(start);
    osc.stop(start + 0.45);
  });

  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();
  sparkle.type = 'sine';
  sparkle.frequency.setValueAtTime(1567.98, t + 0.38);
  sparkle.connect(sparkleGain);
  sparkleGain.connect(ctx.destination);
  sparkleGain.gain.setValueAtTime(0, t + 0.38);
  sparkleGain.gain.linearRampToValueAtTime(0.14, t + 0.4);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  sparkle.start(t + 0.38);
  sparkle.stop(t + 0.95);
}

/** Soft descending tones for try-again / no prize. */
export function playSpinLoseSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);

  const t = ctx.currentTime;
  const notes = [392, 329.63, 261.63];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = t + i * 0.14;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
    osc.start(start);
    osc.stop(start + 0.34);
  });
}
