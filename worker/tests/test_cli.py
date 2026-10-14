import io

import soundfile as sf

from adwentts_worker.cli import main


def test_cli_synth_writes_file(tmp_path, reference_clip, capsys):
    out = tmp_path / "out.wav"
    code = main(
        [
            "--engine",
            "mock",
            "--voices-dir",
            str(tmp_path / "voices"),
            "synth",
            "--text",
            "Medaase. Thank you.",
            "--ref",
            str(reference_clip),
            "--out",
            str(out),
        ]
    )
    assert code == 0
    data, sr = sf.read(io.BytesIO(out.read_bytes()))
    assert sr == 24_000 and len(data) > sr * 0.5
    assert "wrote" in capsys.readouterr().out
