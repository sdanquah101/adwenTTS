# AdwenTTS worker

Python inference service for AdwenTTS. Swappable engines behind one HTTP API, CLI and web UI.

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

# web UI with a public link (what the Colab notebook runs)
adwentts --engine chatterbox ui --share

# HTTP API on :8000
ADWENTTS_ENGINE=chatterbox adwentts serve
```

## API

| Method | Path              | Body                                                                                         | Returns                           |
| ------ | ----------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| GET    | `/health`         |                                                                                              | engine, status, supported formats |
| GET    | `/v1/voices`      |                                                                                              | saved voices                      |
| POST   | `/v1/voices`      | multipart `name`, `file`                                                                     | the saved voice                   |
| DELETE | `/v1/voices/{id}` |                                                                                              | 204                               |
| POST   | `/v1/tts`         | JSON `text`, `voice_id?`, `format?`, `exaggeration?`, `cfg_weight?`, `temperature?`, `seed?` | audio file                        |
| POST   | `/v1/tts/clone`   | multipart `text`, `file`, same knobs                                                         | audio file, nothing saved         |

Audio responses carry `X-Audio-Duration-Seconds` and `X-Synthesis-Seconds` headers.

## Configuration

| Variable                  | Default  | Meaning                          |
| ------------------------- | -------- | -------------------------------- |
| `ADWENTTS_ENGINE`         | `mock`   | engine name                      |
| `ADWENTTS_DEVICE`         | auto     | `cuda`, `mps` or `cpu`           |
| `ADWENTTS_VOICES_DIR`     | `voices` | where saved reference clips live |
| `ADWENTTS_PORT`           | `8000`   | API port                         |
| `ADWENTTS_MAX_TEXT_CHARS` | `5000`   | request size limit               |

## Reference clips

10 to 20 seconds of one speaker in a quiet room, no music, natural pace. Clips are
stored as mono WAV and truncated to 60 s. Chatterbox watermarks its output audio.

## Develop

```sh
pip install -e ".[dev]"
ruff check . && pytest
```
