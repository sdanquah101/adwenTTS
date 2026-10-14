from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from .engines import ENGINE_NAMES, SynthesisOptions, create_engine
from .service import SynthesisService
from .settings import Settings
from .voices import VoiceStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="adwentts", description="AdwenTTS voice-cloning TTS")
    parser.add_argument(
        "--engine", choices=ENGINE_NAMES, help="defaults to $ADWENTTS_ENGINE or mock"
    )
    parser.add_argument("--device", help="cuda | cpu | mps (auto-detected by default)")
    parser.add_argument("--voices-dir", type=Path, help="where saved voices live")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    synth = sub.add_parser("synth", help="synthesize one text to an audio file")
    group = synth.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", help="text to speak")
    group.add_argument("--text-file", type=Path, help="file containing the text")
    synth.add_argument("--ref", type=Path, help="reference clip of the voice to clone")
    synth.add_argument("--voice-id", help="saved voice id instead of --ref")
    synth.add_argument(
        "--out", type=Path, default=Path("speech.wav"), help="output path (.wav/.mp3/.flac)"
    )
    synth.add_argument("--exaggeration", type=float, default=0.5)
    synth.add_argument("--cfg-weight", type=float, default=0.5)
    synth.add_argument("--temperature", type=float, default=0.8)
    synth.add_argument("--seed", type=int)

    serve = sub.add_parser("serve", help="run the HTTP API")
    serve.add_argument("--host")
    serve.add_argument("--port", type=int)
    serve.add_argument("--api-key", help="require this bearer token on /v1/* and /mcp")
    serve.add_argument("--public-url", help="externally reachable base URL for audio links")

    ui = sub.add_parser("ui", help="run the Gradio web UI")
    ui.add_argument("--port", type=int, default=7860)
    ui.add_argument("--share", action="store_true", help="create a public gradio.live link")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    settings = Settings()
    engine_name = args.engine or settings.engine
    device = args.device or settings.device
    voices_dir = args.voices_dir or settings.voices_dir

    if args.command == "serve":
        import os

        import uvicorn

        os.environ["ADWENTTS_ENGINE"] = engine_name
        if device:
            os.environ["ADWENTTS_DEVICE"] = device
        os.environ["ADWENTTS_VOICES_DIR"] = str(voices_dir)
        if args.api_key:
            os.environ["ADWENTTS_API_KEY"] = args.api_key
        if args.public_url:
            os.environ["ADWENTTS_PUBLIC_URL"] = args.public_url
        uvicorn.run(
            "adwentts_worker.server:app",
            factory=True,
            host=args.host or settings.host,
            port=args.port or settings.port,
        )
        return 0

    engine = create_engine(engine_name, device=device)
    engine.load()
    service = SynthesisService(engine, VoiceStore(voices_dir))

    if args.command == "ui":
        from .ui import build_ui

        build_ui(service).launch(server_name="0.0.0.0", server_port=args.port, share=args.share)
        return 0

    text = args.text if args.text is not None else args.text_file.read_text(encoding="utf-8")
    fmt = args.out.suffix.lstrip(".").lower() or "wav"
    if fmt not in ("wav", "mp3", "flac"):
        parser.error(f"unsupported output extension .{fmt}; use .wav, .mp3 or .flac")
    options = SynthesisOptions(
        exaggeration=args.exaggeration,
        cfg_weight=args.cfg_weight,
        temperature=args.temperature,
        seed=args.seed,
    )
    result = service.synthesize(
        text,
        voice_id=args.voice_id,
        reference_path=args.ref,
        fmt=fmt,  # type: ignore[arg-type]
        options=options,
    )
    args.out.write_bytes(result.audio)
    print(
        f"wrote {args.out} ({result.duration_seconds:.1f}s audio, "
        f"{result.elapsed_seconds:.1f}s compute, {engine.name})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
