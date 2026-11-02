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
