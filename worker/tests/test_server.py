import io

import soundfile as sf


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["engine"] == "mock"
    assert "wav" in body["formats"]


def test_voice_lifecycle_and_tts(client, reference_clip):
    with reference_clip.open("rb") as f:
        created = client.post(
            "/v1/voices", data={"name": "Kofi (Accra)"}, files={"file": ("ref.wav", f, "audio/wav")}
        )
    assert created.status_code == 201, created.text
    voice = created.json()
    assert voice["name"] == "Kofi (Accra)"
    assert 2.9 < voice["duration_seconds"] < 3.1

    listed = client.get("/v1/voices").json()
    assert [v["id"] for v in listed] == [voice["id"]]

    res = client.post("/v1/tts", json={"text": "Good morning Accra.", "voice_id": voice["id"]})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "audio/wav"
    assert 'filename="speech.wav"' in res.headers["content-disposition"]
    data, sr = sf.read(io.BytesIO(res.content))
    assert sr == 24_000
    assert abs(len(data) / sr - float(res.headers["x-audio-duration-seconds"])) < 0.01

    assert client.delete(f"/v1/voices/{voice['id']}").status_code == 204
    assert client.delete(f"/v1/voices/{voice['id']}").status_code == 404
    assert client.get("/v1/voices").json() == []


def test_tts_unknown_voice_is_404(client):
    res = client.post("/v1/tts", json={"text": "hi", "voice_id": "0123456789ab"})
    assert res.status_code == 404


def test_tts_invalid_voice_id_is_404(client):
    res = client.post("/v1/tts", json={"text": "hi", "voice_id": "../etc/passwd"})
    assert res.status_code == 404


def test_tts_validation(client):
    assert client.post("/v1/tts", json={"text": ""}).status_code == 422
    assert client.post("/v1/tts", json={"text": "x", "format": "ogg"}).status_code == 422
    assert client.post("/v1/tts", json={"text": "x" * 401}).status_code == 413


def test_tts_flac_and_builtin_voice(client):
    res = client.post("/v1/tts", json={"text": "No reference, built-in voice.", "format": "flac"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/flac"
    data, sr = sf.read(io.BytesIO(res.content))
    assert sr == 24_000 and len(data) > 0


def test_one_shot_clone(client, reference_clip):
    with reference_clip.open("rb") as f:
        res = client.post(
            "/v1/tts/clone",
            data={"text": "One shot clone.", "format": "wav", "seed": "7"},
            files={"file": ("ref.wav", f, "audio/wav")},
        )
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "audio/wav"


def test_short_reference_rejected(client, tmp_path):
    import numpy as np

    short = tmp_path / "short.wav"
    sf.write(short, np.zeros(8000, dtype=np.float32), 16_000)
    with short.open("rb") as f:
        res = client.post(
            "/v1/voices", data={"name": "x"}, files={"file": ("s.wav", f, "audio/wav")}
        )
    assert res.status_code == 400
    assert "1 second" in res.json()["detail"]
