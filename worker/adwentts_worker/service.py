from __future__ import annotations

import logging
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audio import AudioFormat, encode
from .engines import EngineError, SynthesisOptions, TTSEngine
from .voices import VoiceStore

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SynthesisResult:
    audio: bytes
    format: AudioFormat
    sample_rate: int
    duration_seconds: float
    elapsed_seconds: float


class SynthesisService:
    """Engine + voice store behind one call, shared by the API, CLI and UI."""

    def __init__(self, engine: TTSEngine, voices: VoiceStore) -> None:
        self.engine = engine
        self.voices = voices

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        reference_path: Path | None = None,
        fmt: AudioFormat = "wav",
        options: SynthesisOptions | None = None,
    ) -> SynthesisResult:
        options = options or SynthesisOptions()
        if not self.engine.ready:
            raise EngineError("engine is still loading")
        if voice_id is not None:
            voice = self.voices.get(voice_id)
            if voice is None:
                raise LookupError(f"voice {voice_id!r} not found")
            reference_path = self.voices.clip_path(voice_id)

        started = time.perf_counter()
        pcm = self.engine.synthesize(text, reference_path, options)
        elapsed = time.perf_counter() - started
        if pcm.ndim != 1 or pcm.size == 0:
            raise EngineError("engine returned no audio")
        duration = pcm.size / self.engine.sample_rate
        log.info(
            "synthesized %.1fs of audio in %.2fs (%s, %d chars)",
            duration,
            elapsed,
            self.engine.name,
            len(text),
        )
        return SynthesisResult(
            audio=encode(pcm, self.engine.sample_rate, fmt),
            format=fmt,
            sample_rate=self.engine.sample_rate,
            duration_seconds=round(duration, 3),
            elapsed_seconds=round(elapsed, 3),
        )

    def synthesize_with_upload(
        self, text: str, upload: bytes, suffix: str, *, fmt: AudioFormat, options: SynthesisOptions
    ) -> SynthesisResult:
        """One-shot clone: use an uploaded clip as the reference without saving a voice."""
        with tempfile.NamedTemporaryFile(suffix=suffix or ".wav", delete=False) as tmp:
            tmp.write(upload)
            tmp_path = Path(tmp.name)
        try:
            return self.synthesize(text, reference_path=tmp_path, fmt=fmt, options=options)
        finally:
            tmp_path.unlink(missing_ok=True)


def peak_dbfs(pcm: np.ndarray) -> float:
    peak = float(np.max(np.abs(pcm))) if pcm.size else 0.0
    return 20 * np.log10(peak) if peak > 0 else -np.inf
