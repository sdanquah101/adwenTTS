from __future__ import annotations

import json
import re
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import soundfile as sf

from .audio import load_as_mono

MAX_REFERENCE_SECONDS = 60.0
_SAFE_NAME = re.compile(r"[^A-Za-z0-9 _.()-]+")


@dataclass(frozen=True)
class Voice:
    id: str
    name: str
    created_at: str
    duration_seconds: float
    sample_rate: int

    @property
    def path(self) -> Path:  # resolved by the store; kept for typing symmetry
        raise NotImplementedError


class VoiceStore:
    """Reference clips on disk: `<dir>/<id>.wav` plus `<id>.json` metadata.

    Clips are normalised to mono WAV on ingest and truncated to 60 s. For
    cloning, 10 to 20 seconds of clean, single-speaker audio works best.
    """

    def __init__(self, directory: Path) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def add(self, name: str, source: Path) -> Voice:
        samples, sr = load_as_mono(source, max_seconds=MAX_REFERENCE_SECONDS)
        if samples.size < sr * 1.0:
            raise ValueError("reference clip must be at least 1 second long")
        voice_id = uuid.uuid4().hex[:12]
        clean_name = _SAFE_NAME.sub("", name).strip() or voice_id
        sf.write(self.clip_path(voice_id), samples, sr, subtype="PCM_16")
        voice = Voice(
            id=voice_id,
            name=clean_name,
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            duration_seconds=round(samples.size / sr, 2),
            sample_rate=sr,
        )
        self._meta_path(voice_id).write_text(json.dumps(asdict(voice), indent=2))
        return voice

    def get(self, voice_id: str) -> Voice | None:
        meta = self._meta_path(voice_id)
        if not meta.exists() or not self.clip_path(voice_id).exists():
            return None
        return Voice(**json.loads(meta.read_text()))

    def list(self) -> list[Voice]:
        voices = [Voice(**json.loads(p.read_text())) for p in self.directory.glob("*.json")]
        return sorted(voices, key=lambda v: v.created_at)

    def resolve(self, ref: str) -> Voice | None:
        """Find a voice by id, or by name (case-insensitive) when `ref` is not an id."""
        if re.fullmatch(r"[0-9a-f]{12}", ref):
            return self.get(ref)
        wanted = ref.strip().lower()
        for voice in self.list():
            if voice.name.lower() == wanted:
                return voice
        return None

    def delete(self, voice_id: str) -> bool:
        existed = self.get(voice_id) is not None
        self.clip_path(voice_id).unlink(missing_ok=True)
        self._meta_path(voice_id).unlink(missing_ok=True)
        return existed

    def clip_path(self, voice_id: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{12}", voice_id):
            raise ValueError("invalid voice id")
        return self.directory / f"{voice_id}.wav"

    def _meta_path(self, voice_id: str) -> Path:
        return self.clip_path(voice_id).with_suffix(".json")
