from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    """Runtime configuration, read from ADWENTTS_* environment variables."""

    engine: str = field(default_factory=lambda: _env("ADWENTTS_ENGINE", "mock"))
    device: str | None = field(default_factory=lambda: os.environ.get("ADWENTTS_DEVICE") or None)
    voices_dir: Path = field(default_factory=lambda: Path(_env("ADWENTTS_VOICES_DIR", "voices")))
    output_dir: Path = field(default_factory=lambda: Path(_env("ADWENTTS_OUTPUT_DIR", "outputs")))
    host: str = field(default_factory=lambda: _env("ADWENTTS_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(_env("ADWENTTS_PORT", "8000")))
    max_text_chars: int = field(
        default_factory=lambda: int(_env("ADWENTTS_MAX_TEXT_CHARS", "5000"))
    )
    api_key: str | None = field(default_factory=lambda: os.environ.get("ADWENTTS_API_KEY") or None)
    """When set, /v1/* (except audio downloads) and /mcp require `Authorization: Bearer <key>`."""
    public_url: str | None = field(
        default_factory=lambda: (os.environ.get("ADWENTTS_PUBLIC_URL") or "").rstrip("/") or None
    )
    """Externally reachable base URL, used to build absolute audio links (e.g. the tunnel URL)."""
