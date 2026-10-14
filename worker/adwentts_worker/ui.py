from __future__ import annotations

import tempfile
from pathlib import Path

from .audio import available_formats
from .engines import SynthesisOptions
from .service import SynthesisService


def build_ui(service: SynthesisService):  # type: ignore[no-untyped-def]
    try:
        import gradio as gr
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "Gradio is not installed. Install with: pip install 'adwentts-worker[ui]'"
        ) from exc

    formats = available_formats()
    out_dir = Path(tempfile.mkdtemp(prefix="adwentts-ui-"))

    def generate(text, reference, fmt, exaggeration, cfg_weight, temperature, seed):
        if not text or not text.strip():
            raise gr.Error("Enter some text to speak.")
        if reference is None and service.engine.name != "mock":
            raise gr.Error("Upload or record a reference clip of the voice to clone.")
        options = SynthesisOptions(
            exaggeration=float(exaggeration),
            cfg_weight=float(cfg_weight),
            temperature=float(temperature),
            seed=int(seed) if seed not in (None, "", 0) else None,
        )
        try:
            result = service.synthesize(
                text,
                reference_path=Path(reference) if reference else None,
                fmt=fmt,
                options=options,
            )
        except Exception as exc:  # surfaced to the user in the UI
            raise gr.Error(str(exc)) from exc
        path = out_dir / f"speech-{abs(hash((text, reference, seed))) % 10**8:08d}.{fmt}"
        path.write_bytes(result.audio)
        status = (
            f"{result.duration_seconds:.1f}s of audio in {result.elapsed_seconds:.1f}s "
            f"({service.engine.name})"
        )
        return str(path), str(path), status

    with gr.Blocks(title="AdwenTTS") as demo:
        gr.Markdown(
            "# AdwenTTS\nClone a voice from a short clip and speak any English text in it.\n\n"
            "Best results: 10 to 20 seconds of one speaker, quiet room, no music."
        )
        with gr.Row():
            with gr.Column():
                text = gr.Textbox(
                    label="Text", lines=6, placeholder="Type what the voice should say..."
                )
                reference = gr.Audio(
                    label="Reference voice",
                    sources=["upload", "microphone"],
                    type="filepath",
                )
                with gr.Accordion("Advanced", open=False):
                    fmt = gr.Radio(formats, value=formats[0], label="Format")
                    exaggeration = gr.Slider(0.0, 2.0, value=0.5, step=0.05, label="Exaggeration")
                    cfg_weight = gr.Slider(
                        0.0, 1.0, value=0.5, step=0.05, label="CFG weight (lower = slower pace)"
                    )
                    temperature = gr.Slider(0.05, 2.0, value=0.8, step=0.05, label="Temperature")
                    seed = gr.Number(value=0, precision=0, label="Seed (0 = random)")
                button = gr.Button("Generate", variant="primary")
            with gr.Column():
                audio_out = gr.Audio(label="Result", type="filepath")
                file_out = gr.File(label="Download")
                status = gr.Markdown()
        button.click(
            generate,
            inputs=[text, reference, fmt, exaggeration, cfg_weight, temperature, seed],
            outputs=[audio_out, file_out, status],
        )
    return demo
