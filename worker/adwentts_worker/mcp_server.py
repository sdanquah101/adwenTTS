"""MCP (Model Context Protocol) server so tool-using AI models can call AdwenTTS directly."""

from __future__ import annotations

from typing import Any, Literal

from .engines import EngineError, SynthesisOptions
from .service import SynthesisService

INSTRUCTIONS = (
    "AdwenTTS turns English text into speech in a cloned voice. Call list_voices to see the "
    "saved voices, then text_to_speech with the text and a voice name or id. The result "
    "contains an audio_url you can give to the user to listen to or download."
)


def build_mcp_server(service: SynthesisService, outputs: Any, public_base: Any):
    """Return an MCPServer exposing list_voices and text_to_speech.

    `public_base` is a zero-arg callable returning the externally reachable base URL.
    """
    from mcp.server.mcpserver import MCPServer

    mcp = MCPServer("AdwenTTS", instructions=INSTRUCTIONS)

    @mcp.tool(description="List the saved voices available for cloning (id, name, duration).")
    def list_voices() -> list[dict[str, Any]]:
        return [vars(v) for v in service.voices.list()]

    @mcp.tool(
        description=(
            "Synthesize English speech from text in a cloned voice. Returns an audio_url to the "
            "generated file plus its duration. `voice` is a saved voice name or id; omit it for "
            "the engine's built-in voice. Keep text under 5000 characters."
        )
    )
    def text_to_speech(
        text: str,
        voice: str | None = None,
        format: Literal["wav", "mp3", "flac"] = "mp3",
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
    ) -> dict[str, Any]:
        voice_id = None
        if voice:
            resolved = service.voices.resolve(voice)
            if resolved is None:
                names = ", ".join(v.name for v in service.voices.list()) or "none saved"
                raise ValueError(f"voice {voice!r} not found; available: {names}")
            voice_id = resolved.id
        try:
            result = service.synthesize(
                text,
                voice_id=voice_id,
                fmt=format,
                options=SynthesisOptions(exaggeration=exaggeration, cfg_weight=cfg_weight),
            )
        except EngineError as exc:
            raise ValueError(str(exc)) from exc
        name = outputs.save(result.audio, result.format)
        return {
            "audio_url": f"{public_base()}/v1/audio/{name}",
            "format": result.format,
            "duration_seconds": result.duration_seconds,
            "voice_id": voice_id,
            "engine": service.engine.name,
        }

    return mcp
