from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Runtime configuration, read from ADWENTTS_* environment variables."""

    engine: str = field(default_factory=lambda: os.environ.get("ADWENTTS_ENGINE", "mock"))
    device: str | None = field(default_factory=lambda: os.environ.get("ADWENTTS_DEVICE") or None)
    voices_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("ADWENTTS_VOICES_DIR", "voices"))
    )
    host: str = field(default_factory=lambda: os.environ.get("ADWENTTS_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.environ.get("ADWENTTS_PORT", "8000")))
    max_text_chars: int = field(
        default_factory=lambda: int(os.environ.get("ADWENTTS_MAX_TEXT_CHARS", "5000"))
    )
