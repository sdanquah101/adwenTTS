from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf

AudioFormat = Literal["wav", "mp3", "flac"]

MEDIA_TYPES: dict[str, str] = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
}


def available_formats() -> list[str]:
    """Formats this host can encode (MP3 depends on the bundled libsndfile)."""
    supported = {name.lower() for name in sf.available_formats()}
    return [fmt for fmt in MEDIA_TYPES if fmt in supported]


def encode(audio: np.ndarray, sample_rate: int, fmt: AudioFormat) -> bytes:
    """Encode mono float32 PCM to the requested container."""
    if fmt not in MEDIA_TYPES:
        raise ValueError(f"unsupported format {fmt!r}")
    if fmt not in available_formats():
        raise ValueError(f"format {fmt!r} is not supported by libsndfile on this host; use wav")
    buf = io.BytesIO()
    subtype = "PCM_16" if fmt in ("wav", "flac") else None
    sf.write(buf, np.clip(audio, -1.0, 1.0), sample_rate, format=fmt.upper(), subtype=subtype)
    return buf.getvalue()


def concat_with_silence(
    pieces: list[np.ndarray], sample_rate: int, gap_seconds: float
) -> np.ndarray:
    if not pieces:
        return np.zeros(0, dtype=np.float32)
    gap = np.zeros(int(gap_seconds * sample_rate), dtype=np.float32)
    out: list[np.ndarray] = []
    for i, piece in enumerate(pieces):
        if i:
            out.append(gap)
        out.append(piece.astype(np.float32, copy=False))
    return np.concatenate(out)


def load_as_mono(path: Path, max_seconds: float | None = None) -> tuple[np.ndarray, int]:
    """Read any audio file to mono float32, decoding via ffmpeg when libsndfile can't.

    Returns (samples, sample_rate). Optionally truncates to `max_seconds`.
    """
    try:
        data, sr = sf.read(path, dtype="float32", always_2d=True)
    except (sf.LibsndfileError, RuntimeError):
        data, sr = _decode_with_ffmpeg(path)
    mono = data.mean(axis=1) if data.shape[1] > 1 else data[:, 0]
    if max_seconds is not None:
        mono = mono[: int(max_seconds * sr)]
    return mono.astype(np.float32, copy=False), int(sr)


def _decode_with_ffmpeg(path: Path) -> tuple[np.ndarray, int]:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise ValueError(
            f"could not decode {path.name}: unsupported format and ffmpeg is not installed. "
            "Upload WAV, FLAC, OGG or MP3."
        )
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "decoded.wav"
        result = subprocess.run(
            [ffmpeg, "-v", "error", "-y", "-i", str(path), "-ac", "1", str(out)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(f"ffmpeg could not decode {path.name}: {result.stderr.strip()}")
        data, sr = sf.read(out, dtype="float32", always_2d=True)
    return data, sr
