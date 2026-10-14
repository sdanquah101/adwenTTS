import numpy as np

from adwentts_worker.engines import SynthesisOptions, create_engine


def test_mock_engine_is_deterministic_and_scales_with_text(reference_clip):
    engine = create_engine("mock")
    engine.load()
    a = engine.synthesize("Hello there.", reference_clip, SynthesisOptions())
    b = engine.synthesize("Hello there.", reference_clip, SynthesisOptions())
    longer = engine.synthesize(
        "Hello there, this sentence is noticeably longer.", None, SynthesisOptions()
    )
    assert a.dtype == np.float32 and a.ndim == 1
    np.testing.assert_array_equal(a, b)
    assert longer.size > a.size
    assert np.max(np.abs(a)) <= 1.0


def test_unknown_engine():
    import pytest

    with pytest.raises(ValueError):
        create_engine("nope")
