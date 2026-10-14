from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

import numpy as np


class EngineError(RuntimeError):
    """Raised when an engine cannot synthesize (bad input, missing model, etc.)."""


@dataclass(frozen=True)
class SynthesisOptions:
    """Knobs shared across engines. Engines ignore what they don't support."""

    exaggeration: float = 0.5
    """Emotion / intensity. 0.5 is neutral for Chatterbox; higher is more dramatic."""
    cfg_weight: float = 0.5
    """Classifier-free guidance. Lower values slow the pace and track the reference more closely."""
    temperature: float = 0.8
    seed: int | None = None


@runtime_checkable
class TTSEngine(Protocol):
    name: str
    sample_rate: int

    def load(self) -> None:
        """Load model weights. Called once at startup; may be slow."""

    @property
    def ready(self) -> bool: ...

    def synthesize(
        self, text: str, reference_path: Path | None, options: SynthesisOptions
    ) -> np.ndarray:
        """Return mono float32 PCM in [-1, 1] at `sample_rate`.

        `reference_path` is a clip of the voice to clone, or None for the engine's
        built-in voice (if it has one).
        """
        ...
