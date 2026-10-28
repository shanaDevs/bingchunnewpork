"""Generate cart-add and order-placed notification WAV assets."""
from __future__ import annotations

import math
import os
import shutil
import struct
import wave

SR = 44100


def write_wav(path: str, samples: list[float]) -> None:
    frames = bytearray()
    for s in samples:
        v = max(-1.0, min(1.0, s))
        frames += struct.pack("<h", int(v * 32767))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    print(path, "dur=", round(len(samples) / SR, 3), "s")


def env_adsr(t: float, total: float, a=0.01, d=0.05, s=0.55, r=0.12) -> float:
    if t < a:
        return t / a if a > 0 else 1.0
    if t < a + d:
        return 1.0 - (1.0 - s) * ((t - a) / d)
    sustain_end = max(a + d, total - r)
    if t < sustain_end:
        return s
    if t < total:
        return s * (1.0 - (t - sustain_end) / r)
    return 0.0


def tone(
    freq: float,
    dur: float,
    gain: float = 0.45,
    a: float = 0.008,
    d: float = 0.04,
    s: float = 0.4,
    r: float = 0.18,
    harm: tuple[float, ...] = (1.0, 0.35, 0.12),
) -> list[float]:
    n = int(SR * dur)
    out: list[float] = []
    for i in range(n):
        t = i / SR
        e = env_adsr(t, dur, a, d, s, r)
        sig = 0.0
        for hi, amp in enumerate(harm, start=1):
            sig += amp * math.sin(2 * math.pi * freq * hi * t)
        sig += 0.08 * math.sin(2 * math.pi * freq * 2.5 * t)
        out.append(sig * e * gain)
    return out


def mix_at(buf: list[float], start_s: float, clip: list[float]) -> None:
    start = int(start_s * SR)
    need = start + len(clip)
    if len(buf) < need:
        buf.extend([0.0] * (need - len(buf)))
    for i, v in enumerate(clip):
        buf[start + i] += v


def main() -> None:
    # Cart add: bright short UI "bling"
    cart: list[float] = []
    mix_at(
        cart,
        0.00,
        tone(880, 0.16, gain=0.38, a=0.004, d=0.03, s=0.25, r=0.12, harm=(1.0, 0.45, 0.18)),
    )
    mix_at(
        cart,
        0.07,
        tone(1318.5, 0.22, gain=0.42, a=0.003, d=0.04, s=0.2, r=0.16, harm=(1.0, 0.4, 0.15)),
    )
    mix_at(
        cart,
        0.00,
        tone(2200, 0.04, gain=0.12, a=0.001, d=0.01, s=0.1, r=0.03, harm=(1.0,)),
    )
    if len(cart) < int(0.35 * SR):
        cart.extend([0.0] * (int(0.35 * SR) - len(cart)))

    # Order placed: warmer 3-note success ringtone
    placed: list[float] = []
    mix_at(
        placed,
        0.00,
        tone(523.25, 0.42, gain=0.36, a=0.01, d=0.08, s=0.35, r=0.28, harm=(1.0, 0.5, 0.22, 0.08)),
    )
    mix_at(
        placed,
        0.16,
        tone(659.25, 0.45, gain=0.34, a=0.01, d=0.08, s=0.32, r=0.30, harm=(1.0, 0.48, 0.2, 0.07)),
    )
    mix_at(
        placed,
        0.32,
        tone(783.99, 0.55, gain=0.38, a=0.01, d=0.1, s=0.3, r=0.38, harm=(1.0, 0.45, 0.18, 0.06)),
    )
    mix_at(
        placed,
        0.34,
        tone(1567.98, 0.35, gain=0.12, a=0.005, d=0.05, s=0.15, r=0.25, harm=(1.0, 0.25)),
    )
    if len(placed) < int(1.0 * SR):
        placed.extend([0.0] * (int(1.0 * SR) - len(placed)))

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cart_path = os.path.join(base, "assets", "sounds", "cart_add_v2.wav")
    placed_path = os.path.join(base, "assets", "sounds", "order_placed.wav")
    write_wav(cart_path, cart)
    write_wav(os.path.join(base, "assets", "sounds", "cart_add.wav"), cart)
    write_wav(placed_path, placed)

    for dest in [
        os.path.join(base, "android", "app", "src", "main", "res", "raw", "order_placed.wav"),
        os.path.join(base, "ios", "Runner", "order_placed.wav"),
    ]:
        shutil.copy2(placed_path, dest)
        print("copied ->", dest)


if __name__ == "__main__":
    main()
