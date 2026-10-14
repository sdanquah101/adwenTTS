from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

import numpy as np

from ..audio import concat_with_silence
from ..text import split_text
from .base import EngineError, SynthesisOptions

log = logging.getLogger(__name__)

Variant = Literal["standard", "turbo"]


class ChatterboxEngine:
    """Resemble AI's Chatterbox (MIT) zero-shot voice-cloning TTS.

    Weights are downloaded from the Hugging Face Hub on first load. The reference
    clip is embedded once per request and reused across text chunks, so long
    inputs cost one conditioning pass plus one generate() per chunk.
    """

    sample_rate = 24_000
    max_chunk_chars = 250

    def __init__(self, device: str | None = None, variant: Variant = "standard") -> None:
        self.name = "chatterbox" if variant == "standard" else "chatterbox-turbo"
        self.variant: Variant = variant
        self.device = device
        self._model: Any = None

    def load(self) -> None:
        try:
            import torch
        except ImportError as exc:  # pragma: no cover - exercised only without the extra
            raise EngineError(
                "Chatterbox is not installed. "
                "Install with: pip install 'adwentts-worker[chatterbox]'"
            ) from exc

        if self.device is None:
            if torch.cuda.is_available():
                self.device = "cuda"
            elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"
                log.warning(
                    "No GPU detected; Chatterbox on CPU is very slow (minutes per sentence)"
                )

        if self.variant == "turbo":
            from chatterbox.tts_turbo import ChatterboxTurboTTS as Model
        else:
            from chatterbox.tts import ChatterboxTTS as Model

        log.info("Loading %s on %s", self.name, self.device)
        self._model = Model.from_pretrained(device=self.device)
        self.sample_rate = int(self._model.sr)
        log.info("%s ready (sample rate %d)", self.name, self.sample_rate)

    @property
    def ready(self) -> bool:
        return self._model is not None

    def synthesize(
        self, text: str, reference_path: Path | None, options: SynthesisOptions
    ) -> np.ndarray:
        if self._model is None:
            raise EngineError("engine not loaded")
        import torch

        if options.seed is not None:
            torch.manual_seed(options.seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(options.seed)

        chunks = split_text(text, max_chars=self.max_chunk_chars)
        if not chunks:
            raise EngineError("text is empty")

        if reference_path is not None:
            self._model.prepare_conditionals(str(reference_path), exaggeration=options.exaggeration)
        elif getattr(self._model, "conds", None) is None:
            raise EngineError("no reference voice given and this model has no built-in voice")

        pieces: list[np.ndarray] = []
        for i, chunk in enumerate(chunks):
            log.debug("chunk %d/%d (%d chars)", i + 1, len(chunks), len(chunk))
            with torch.inference_mode():
                wav = self._model.generate(
                    chunk,
                    exaggeration=options.exaggeration,
                    cfg_weight=options.cfg_weight,
                    temperature=options.temperature,
                )
            pieces.append(wav.squeeze(0).detach().cpu().numpy().astype(np.float32))

        return concat_with_silence(pieces, self.sample_rate, gap_seconds=0.25)
