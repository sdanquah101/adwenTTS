from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from adwentts_worker.engines.mock import MockEngine
from adwentts_worker.outputs import OutputStore
from adwentts_worker.server import create_app
from adwentts_worker.settings import Settings
from adwentts_worker.voices import VoiceStore

API_KEY = "test-key-123"


@pytest.fixture
def reference_clip(tmp_path: Path) -> Path:
    sr = 16_000
    t = np.arange(sr * 3) / sr
    wav = (0.4 * np.sin(2 * np.pi * 140 * t)).astype(np.float32)
    path = tmp_path / "ref.wav"
    sf.write(path, wav, sr)
    return path


def _make_app(tmp_path: Path, **overrides):
    settings = Settings(
        max_text_chars=400,
        voices_dir=tmp_path / "voices",
        output_dir=tmp_path / "outputs",
        **overrides,
    )
    return create_app(
        engine=MockEngine(),
        voices=VoiceStore(settings.voices_dir),
        outputs=OutputStore(settings.output_dir),
        settings=settings,
    )


@pytest.fixture
def client(tmp_path: Path):
    with TestClient(_make_app(tmp_path)) as c:
        yield c


@pytest.fixture
def secured_client(tmp_path: Path):
    with TestClient(_make_app(tmp_path, api_key=API_KEY, public_url="https://tts.example")) as c:
        yield c
