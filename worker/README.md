# AdwenTTS worker

Python inference service for AdwenTTS. Swappable engines behind one HTTP API, an MCP endpoint
for AI models, a CLI and a web UI.

| Engine             | What it is                                                    | Needs                           |
| ------------------ | ------------------------------------------------------------- | ------------------------------- |
| `mock`             | Deterministic speech-shaped audio for tests and wiring        | nothing                         |
| `chatterbox`       | Resemble AI Chatterbox (MIT), zero-shot English voice cloning | GPU with 8 GB+ VRAM recommended |
| `chatterbox-turbo` | Faster Chatterbox variant                                     | same                            |

## Install

```sh
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -e ".[chatterbox,ui]"   # or just `pip install -e .` for the mock engine
```

## Use

```sh
# one file, one command
adwentts --engine chatterbox synth --text "Akwaaba, welcome to Accra." --ref kofi.wav --out kofi.mp3

# web UI with a public link
adwentts --engine chatterbox ui --share

# HTTP API + MCP on :8000, protected by an API key
adwentts --engine chatterbox serve --api-key "$(openssl rand -hex 16)" --public-url https://your-host
```

## API

Send `Authorization: Bearer <key>` (or `X-API-Key`) when the server was started with a key.
Interactive docs at `/docs`, machine-readable spec at `/openapi.json`.

| Method | Path               | Body                                                           | Returns                                                      |
| ------ | ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/health`          |                                                                | engine, status, formats, auth mode                           |
| GET    | `/v1/voices`       |                                                                | saved voices                                                 |
| POST   | `/v1/voices`       | multipart `name`, `file`                                       | the saved voice                                              |
| DELETE | `/v1/voices/{id}`  |                                                                | 204                                                          |
| POST   | `/v1/tts`          | JSON `text`, `voice` (name or id), `format`, `response`, knobs | audio file, or JSON with `audio_url` when `response: "json"` |
| POST   | `/v1/tts/clone`    | multipart `text`, `file`, same knobs                           | audio file or JSON, nothing saved                            |
| POST   | `/v1/audio/speech` | OpenAI shape: `input`, `voice`, `response_format`              | audio file                                                   |
| GET    | `/v1/audio/{name}` |                                                                | a generated file (no key needed; names are unguessable)      |
| POST   | `/mcp`             | MCP streamable HTTP                                            | tools `list_voices`, `text_to_speech`                        |

Audio responses carry `X-Audio-Duration-Seconds` and `X-Synthesis-Seconds` headers.
See [`docs/AGENT_INTEGRATION.md`](../docs/AGENT_INTEGRATION.md) for connecting an AI model.

## Configuration

| Variable                  | Default      | Meaning                                                           |
| ------------------------- | ------------ | ----------------------------------------------------------------- |
| `ADWENTTS_ENGINE`         | `mock`       | engine name                                                       |
| `ADWENTTS_DEVICE`         | auto         | `cuda`, `mps` or `cpu`                                            |
| `ADWENTTS_API_KEY`        | unset        | when set, required on `/v1/*` (except audio downloads) and `/mcp` |
| `ADWENTTS_PUBLIC_URL`     | request host | base URL used in `audio_url` links                                |
| `ADWENTTS_VOICES_DIR`     | `voices`     | saved reference clips                                             |
| `ADWENTTS_OUTPUT_DIR`     | `outputs`    | generated files served at `/v1/audio/`                            |
| `ADWENTTS_PORT`           | `8000`       | API port                                                          |
| `ADWENTTS_MAX_TEXT_CHARS` | `5000`       | request size limit                                                |

## Reference clips

10 to 20 seconds of one speaker in a quiet room, no music, natural pace. Clips are
stored as mono WAV and truncated to 60 s. Chatterbox watermarks its output audio.

## Develop

```sh
pip install -e ".[dev]"
ruff check . && pytest
```
