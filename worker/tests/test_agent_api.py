"""The surface an AI model uses: API key, JSON responses with audio links, OpenAI shape, MCP."""

from __future__ import annotations

import io

import soundfile as sf

from tests.conftest import API_KEY

AUTH = {"Authorization": f"Bearer {API_KEY}"}
MCP_HEADERS = {
    **AUTH,
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


def _create_voice(client, clip, name="Kofi", headers=None):
    with clip.open("rb") as f:
        res = client.post(
            "/v1/voices",
            data={"name": name},
            files={"file": ("ref.wav", f, "audio/wav")},
            headers=headers or {},
        )
    assert res.status_code == 201, res.text
    return res.json()


def test_api_key_required_except_open_paths(secured_client, reference_clip):
    assert secured_client.get("/health").status_code == 200
    assert secured_client.get("/openapi.json").status_code == 200
    assert secured_client.get("/v1/voices").status_code == 401
    assert secured_client.post("/v1/tts", json={"text": "hi"}).status_code == 401
    assert secured_client.get("/v1/voices", headers=AUTH).status_code == 200
    assert secured_client.get("/v1/voices", headers={"X-API-Key": API_KEY}).status_code == 200
    assert secured_client.get("/v1/voices", headers={"X-API-Key": "nope"}).status_code == 401
    assert secured_client.get("/health").json()["auth"] == "api_key"


def test_json_response_returns_downloadable_link(secured_client, reference_clip):
    voice = _create_voice(secured_client, reference_clip, headers=AUTH)
    res = secured_client.post(
        "/v1/tts",
        json={"text": "Akwaaba.", "voice": "kofi", "format": "wav", "response": "json"},
        headers=AUTH,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["voice_id"] == voice["id"]
    assert body["engine"] == "mock"
    assert body["audio_url"].startswith("https://tts.example/v1/audio/")
    assert body["audio_url"].endswith(".wav")

    # the link is open (no key) so it can be handed to a user or another tool
    name = body["audio_url"].rsplit("/", 1)[1]
    dl = secured_client.get(f"/v1/audio/{name}")
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "audio/wav"
    data, sr = sf.read(io.BytesIO(dl.content))
    assert sr == 24_000 and abs(len(data) / sr - body["duration_seconds"]) < 0.01

    assert secured_client.get("/v1/audio/0000000000000000.wav").status_code == 404
    assert secured_client.get("/v1/audio/..%2F..%2Fetc%2Fpasswd").status_code in (401, 404, 400)


def test_voice_lookup_by_name_and_unknown(client, reference_clip):
    _create_voice(client, reference_clip, name="Ama (Kumasi)")
    ok = client.post("/v1/tts", json={"text": "hi", "voice": "ama (kumasi)"})
    assert ok.status_code == 200
    missing = client.post("/v1/tts", json={"text": "hi", "voice": "nobody"})
    assert missing.status_code == 404
    assert "Ama (Kumasi)" in missing.json()["detail"]


def test_openai_compatible_endpoint(client, reference_clip):
    _create_voice(client, reference_clip, name="Kofi")
    res = client.post(
        "/v1/audio/speech",
        json={
            "model": "adwentts",
            "input": "Hello from Accra.",
            "voice": "Kofi",
            "response_format": "wav",
        },
    )
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "audio/wav"
    data, sr = sf.read(io.BytesIO(res.content))
    assert sr == 24_000 and len(data) > 0


def test_clone_endpoint_json_mode(client, reference_clip):
    with reference_clip.open("rb") as f:
        res = client.post(
            "/v1/tts/clone",
            data={"text": "One shot.", "format": "wav", "response": "json"},
            files={"file": ("ref.wav", f, "audio/wav")},
        )
    assert res.status_code == 200, res.text
    assert res.json()["audio_url"].endswith(".wav")


def _rpc(client, method, params=None, id=1):
    payload = {"jsonrpc": "2.0", "id": id, "method": method}
    if params is not None:
        payload["params"] = params
    return client.post("/mcp", json=payload, headers=MCP_HEADERS)


def test_mcp_endpoint_lists_and_calls_tools(secured_client, reference_clip):
    assert (
        secured_client.post(
            "/mcp", json={}, headers={"Content-Type": "application/json"}
        ).status_code
        == 401
    )

    init = _rpc(
        secured_client,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "0"},
        },
    )
    assert init.status_code == 200, init.text
    assert init.json()["result"]["serverInfo"]["name"] == "AdwenTTS"

    tools = _rpc(secured_client, "tools/list", id=2)
    assert tools.status_code == 200, tools.text
    names = {t["name"] for t in tools.json()["result"]["tools"]}
    assert {"list_voices", "text_to_speech"} <= names

    _create_voice(secured_client, reference_clip, name="Kofi", headers=AUTH)
    call = _rpc(
        secured_client,
        "tools/call",
        {
            "name": "text_to_speech",
            "arguments": {"text": "Medaase.", "voice": "Kofi", "format": "wav"},
        },
        id=3,
    )
    assert call.status_code == 200, call.text
    result = call.json()["result"]
    assert not result.get("isError"), result
    structured = result["structuredContent"]
    assert structured["audio_url"].startswith("https://tts.example/v1/audio/")
    assert structured["duration_seconds"] > 0

    bad = _rpc(
        secured_client,
        "tools/call",
        {"name": "text_to_speech", "arguments": {"text": "x", "voice": "ghost"}},
        id=4,
    )
    assert bad.status_code == 200
    assert bad.json()["result"]["isError"] is True
