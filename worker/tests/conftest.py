from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from adwentts_worker.engines.mock import MockEngine
from adwentts_worker.server import create_app
from adwentts_worker.settings import Settings
from adwentts_worker.voices import VoiceStore


@pytest.fixture
def reference_clip(tmp_path: Path) -> Path:
    sr = 16_000
    t = np.arange(sr * 3) / sr
    wav = (0.4 * np.sin(2 * np.pi * 140 * t)).astype(np.float32)
    path = tmp_path / "ref.wav"
    sf.write(path, wav, sr)
    return path


@pytest.fixture
def client(tmp_path: Path):
    app = create_app(
        engine=MockEngine(),
        voices=VoiceStore(tmp_path / "voices"),
        settings=Settings(max_text_chars=400),
    )
    with TestClient(app) as c:
        yield c
