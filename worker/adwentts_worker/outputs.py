from __future__ import annotations

import re
import secrets
from pathlib import Path

from .audio import MEDIA_TYPES

_NAME = re.compile(r"^[0-9a-f]{16}\.(wav|mp3|flac)$")


class OutputStore:
    """Synthesized files on disk, addressed by an unguessable name like `3f9a...c1.mp3`."""

    def __init__(self, directory: Path) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def save(self, audio: bytes, fmt: str) -> str:
        if fmt not in MEDIA_TYPES:
            raise ValueError(f"unsupported format {fmt!r}")
        name = f"{secrets.token_hex(8)}.{fmt}"
        (self.directory / name).write_bytes(audio)
        return name

    def path(self, name: str) -> Path | None:
        if not _NAME.match(name):
            return None
        path = self.directory / name
        return path if path.is_file() else None

    @staticmethod
    def media_type(name: str) -> str:
        return MEDIA_TYPES[name.rsplit(".", 1)[1]]
