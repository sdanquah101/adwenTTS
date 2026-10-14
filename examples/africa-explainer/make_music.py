"""Generate a royalty-free backing track with numpy: West African-flavoured percussion,
a soft pad and a kalimba-like melody. Writes two stems: full.wav and calm.wav."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44_100
BPM = 92
BEAT = 60 / BPM
DURATION = float(sys.argv[1]) if len(sys.argv) > 1 else 230.0
OUT = Path(__file__).with_name("music")
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(7)

N = int(DURATION * SR)
t_all = np.arange(N) / SR


def place(buf: np.ndarray, start: float, sample: np.ndarray, gain: float = 1.0) -> None:
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sample))
    buf[i:j] += gain * sample[: j - i]


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def drum(freq: float, length: float, drop: float = 0.5, decay: float = 0.12, noise: float = 0.0) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = freq * (1 + drop * np.exp(-t / 0.02))
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * env(n, 0.001, decay)
    if noise:
        body += noise * rng.standard_normal(n) * env(n, 0.0005, 0.03)
    return body


def shaker(length: float = 0.08) -> np.ndarray:
    n = int(length * SR)
    x = rng.standard_normal(n)
    # crude high-pass: difference
    x = np.diff(x, prepend=0.0)
    return x * env(n, 0.002, 0.03) * 0.5


def pluck(freq: float, length: float = 1.2) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    e = env(n, 0.002, 0.35)
    return (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t / 0.15)
            + 0.15 * np.sin(2 * np.pi * 3.01 * freq * t) * np.exp(-t / 0.08)) * e


def pad_chord(freqs: list[float], length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for detune in (-0.4, 0.0, 0.4):
            out += np.sin(2 * np.pi * (f + detune) * t + rng.uniform(0, 6.28)) / len(freqs)
            out += 0.3 * np.sin(2 * np.pi * (2 * f + detune) * t) / len(freqs)
    a = np.minimum(1.0, t / 1.2)
    r = np.minimum(1.0, (length - t) / 1.2)
    return out * a * r * 0.25


def reverb(x: np.ndarray, mix: float = 0.18) -> np.ndarray:
    y = x.copy()
    for delay, gain in ((0.031, 0.55), (0.047, 0.45), (0.071, 0.35), (0.113, 0.25)):
        d = int(delay * SR)
        buf = np.zeros_like(x)
        buf[d:] = x[:-d]
        # feedback comb
        for _ in range(3):
            buf[d:] += gain * buf[:-d] * 0.5
        y += mix * buf * gain
    return y


# ---- note tables (A minor pentatonic) ----
A3 = 220.0
penta = [A3 * 2 ** (s / 12) for s in (0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24)]
chords = [
    [110.0, 164.81, 220.0, 261.63],   # Am
    [87.31, 130.81, 174.61, 220.0],   # F
    [130.81, 196.0, 261.63, 329.63],  # C
    [98.0, 146.83, 196.0, 246.94],    # G
]

pad = np.zeros(N)
melody = np.zeros(N)
drums = np.zeros(N)

bar = 4 * BEAT
n_bars = int(DURATION / bar) + 1
for b in range(n_bars):
    start = b * bar
    chord = chords[(b // 2) % 4]
    place(pad, start, pad_chord(chord, 2 * bar if b % 2 == 0 else 0.0) if b % 2 == 0 else np.zeros(1))

    # percussion pattern (16ths): bass on 1 and 3-and, tone on 2-and and 4, slap sprinkled
    for s in range(16):
        tm = start + s * BEAT / 4
        if s in (0, 10):
            place(drums, tm, drum(70, 0.4, drop=0.8, decay=0.18), 0.9)
        if s in (4, 6, 12, 15):
            place(drums, tm, drum(180, 0.2, drop=0.4, decay=0.09, noise=0.3), 0.45)
        if s in (3, 9, 13) and rng.random() < 0.6:
            place(drums, tm, drum(320, 0.12, drop=0.3, decay=0.05, noise=0.6), 0.3)
        if s % 2 == 0:
            place(drums, tm, shaker(), 0.28 if s % 4 == 0 else 0.18)

    # kalimba phrase: 8ths with rests, restricted to chord-friendly pentatonic
    if b % 8 not in (3, 7):  # breathe every 4th bar
        for s in range(8):
            if rng.random() < 0.45:
                tm = start + s * BEAT / 2
                note = penta[int(rng.integers(2, len(penta)))]
                place(melody, tm, pluck(note), 0.35)

pad = reverb(pad, 0.25)
melody = reverb(melody, 0.2)
drums = reverb(drums, 0.08)


def master(x: np.ndarray) -> np.ndarray:
    x = x / (np.max(np.abs(x)) + 1e-9)
    # gentle fade in/out
    f = int(2 * SR)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    return (0.9 * x).astype(np.float32)


full = master(pad * 0.9 + melody * 0.9 + drums * 0.8)
calm = master(pad * 1.0 + melody * 0.5)
sf.write(OUT / "full.wav", full, SR, subtype="PCM_16")
sf.write(OUT / "calm.wav", calm, SR, subtype="PCM_16")
print(f"wrote music/full.wav and music/calm.wav ({DURATION:.0f}s at {BPM} bpm)")
