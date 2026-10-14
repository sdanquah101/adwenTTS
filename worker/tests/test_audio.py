import io

import numpy as np
import soundfile as sf

from adwentts_worker.audio import available_formats, concat_with_silence, encode


def test_wav_roundtrip():
    sr = 24_000
    pcm = (0.5 * np.sin(np.linspace(0, 200, sr))).astype(np.float32)
    data, read_sr = sf.read(io.BytesIO(encode(pcm, sr, "wav")), dtype="float32")
    assert read_sr == sr
    assert data.shape == pcm.shape
    assert np.allclose(data, pcm, atol=1e-3)


def test_available_formats_includes_wav_and_flac():
    assert "wav" in available_formats()
    assert "flac" in available_formats()


def test_concat_with_silence():
    sr = 1000
    out = concat_with_silence([np.ones(10, np.float32), np.ones(5, np.float32)], sr, 0.1)
    assert out.size == 10 + 100 + 5
    assert out[10:110].sum() == 0
