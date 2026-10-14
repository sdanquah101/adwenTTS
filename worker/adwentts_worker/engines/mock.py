from __future__ import annotations

import zlib
from pathlib import Path

import numpy as np

from .base import SynthesisOptions


class MockEngine:
    """Deterministic, CPU-only stand-in that produces speech-shaped audio.

    Lets the API, CLI and tests run without model weights or a GPU. Output length
    scales with the text; pitch is derived from the reference clip so different
    "voices" sound different.
    """

    name = "mock"
    sample_rate = 24_000
    chars_per_second = 14.0

    def __init__(self) -> None:
        self._ready = False

    def load(self) -> None:
        self._ready = True

    @property
    def ready(self) -> bool:
        return self._ready

    def synthesize(
        self, text: str, reference_path: Path | None, options: SynthesisOptions
    ) -> np.ndarray:
        seed = zlib.crc32(text.encode("utf-8"))
        if reference_path is not None:
            seed ^= zlib.crc32(reference_path.read_bytes())
        if options.seed is not None:
            seed ^= options.seed & 0xFFFFFFFF
        rng = np.random.default_rng(seed)

        sr = self.sample_rate
        duration = max(0.4, len(text) / self.chars_per_second)
        n = int(duration * sr)
        t = np.arange(n, dtype=np.float64) / sr

        base_f0 = 90.0 + (seed % 120)  # 90–210 Hz "voice"
        vibrato = 1.0 + 0.12 * np.sin(2 * np.pi * 1.7 * t + rng.uniform(0, 2 * np.pi))
        phase = 2 * np.pi * np.cumsum(base_f0 * vibrato) / sr
        voiced = 0.55 * np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.1 * np.sin(3 * phase)

        syllables = 0.5 * (1.0 + np.sin(2 * np.pi * 4.2 * t + rng.uniform(0, 2 * np.pi)))
        noise = 0.03 * rng.standard_normal(n)
        signal = voiced * syllables + noise

        fade = min(n // 2, int(0.02 * sr))
        if fade > 0:
            ramp = np.linspace(0.0, 1.0, fade)
            signal[:fade] *= ramp
            signal[-fade:] *= ramp[::-1]

        peak = float(np.max(np.abs(signal))) or 1.0
        return (0.3 * signal / peak).astype(np.float32)
