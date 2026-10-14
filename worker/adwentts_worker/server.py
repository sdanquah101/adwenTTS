from __future__ import annotations

import logging
import secrets
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from . import __version__
from .audio import MEDIA_TYPES, AudioFormat, available_formats
from .engines import EngineError, SynthesisOptions, TTSEngine, create_engine
from .outputs import OutputStore
from .service import SynthesisResult, SynthesisService
from .settings import Settings
from .voices import VoiceStore

log = logging.getLogger(__name__)

ResponseMode = Literal["audio", "json"]

OPEN_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json", "/v1/audio/")
"""Paths that never require the API key (audio links are unguessable and meant to be shared)."""


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000, description="English text to speak")
    voice: str | None = Field(default=None, description="Saved voice name or id")
    voice_id: str | None = Field(default=None, description="Saved voice id (takes precedence)")
    format: AudioFormat = "wav"
    response: ResponseMode = Field(
        default="audio",
        description="`audio` streams the file; `json` saves it and returns an audio_url",
    )
    exaggeration: float = Field(default=0.5, ge=0.0, le=2.0)
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    temperature: float = Field(default=0.8, ge=0.05, le=2.0)
    seed: int | None = Field(default=None, ge=0)

    def options(self) -> SynthesisOptions:
        return SynthesisOptions(
            exaggeration=self.exaggeration,
            cfg_weight=self.cfg_weight,
            temperature=self.temperature,
            seed=self.seed,
        )


class OpenAISpeechRequest(BaseModel):
    """Body of the OpenAI-compatible `POST /v1/audio/speech` endpoint."""

    input: str = Field(min_length=1, max_length=5000)
    voice: str = Field(description="Saved voice name or id")
    model: str | None = None
    response_format: AudioFormat = "mp3"
    speed: float | None = None


class VoiceOut(BaseModel):
    id: str
    name: str
    created_at: str
    duration_seconds: float
    sample_rate: int


class SynthesisOut(BaseModel):
    id: str
    audio_url: str
    format: AudioFormat
    duration_seconds: float
    sample_rate: int
    synthesis_seconds: float
    voice_id: str | None
    engine: str


def create_app(
    engine: TTSEngine | None = None,
    voices: VoiceStore | None = None,
    settings: Settings | None = None,
    outputs: OutputStore | None = None,
) -> FastAPI:
    settings = settings or Settings()
    engine = engine or create_engine(settings.engine, device=settings.device)
    voices = voices or VoiceStore(settings.voices_dir)
    outputs = outputs or OutputStore(settings.output_dir)
    service = SynthesisService(engine, voices)

    try:
        from .mcp_server import build_mcp_server

        mcp = build_mcp_server(service, outputs, lambda: _public_base(settings, None))
    except ImportError:  # pragma: no cover - mcp is a hard dependency, kept defensive
        mcp = None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if not engine.ready:
            await run_in_threadpool(engine.load)
        if mcp is not None:
            async with mcp.session_manager.run():
                yield
        else:
            yield

    app = FastAPI(
        title="AdwenTTS",
        version=__version__,
        description=(
            "Voice-cloning text-to-speech. Create a voice from a reference clip, then "
            "synthesize text in that voice. Send `Authorization: Bearer <api key>` when the "
            "server has one configured."
        ),
        lifespan=lifespan,
    )
    app.state.service = service
    app.state.settings = settings

    @app.middleware("http")
    async def require_api_key(request: Request, call_next):  # type: ignore[no-untyped-def]
        if settings.api_key and not request.url.path.startswith(OPEN_PREFIXES):
            if not _key_matches(request, settings.api_key):
                return JSONResponse(
                    status_code=401,
                    content={
                        "detail": "missing or invalid API key; send Authorization: Bearer <key>"
                    },
                    headers={"WWW-Authenticate": "Bearer"},
                )
        return await call_next(request)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok" if engine.ready else "loading",
            "engine": engine.name,
            "sample_rate": engine.sample_rate,
            "formats": available_formats(),
            "auth": "api_key" if settings.api_key else "none",
            "mcp": "/mcp" if mcp is not None else None,
            "version": __version__,
        }

    @app.get("/v1/voices", response_model=list[VoiceOut])
    async def list_voices() -> list[VoiceOut]:
        return [VoiceOut(**vars(v)) for v in voices.list()]

    @app.post("/v1/voices", response_model=VoiceOut, status_code=201)
    async def create_voice(
        name: Annotated[str, Form(min_length=1, max_length=80)],
        file: Annotated[UploadFile, File(description="Reference clip, 10–20 s of clean speech")],
    ) -> VoiceOut:
        suffix = Path(file.filename or "clip.wav").suffix or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)
        try:
            voice = await run_in_threadpool(voices.add, name, tmp_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            tmp_path.unlink(missing_ok=True)
        return VoiceOut(**vars(voice))

    @app.delete("/v1/voices/{voice_id}", status_code=204)
    async def delete_voice(voice_id: str) -> Response:
        try:
            existed = voices.delete(voice_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not existed:
            raise HTTPException(status_code=404, detail="voice not found")
        return Response(status_code=204)

    @app.post("/v1/tts", response_model=None, responses={200: {"content": {"audio/*": {}}}})
    async def text_to_speech(req: TTSRequest, request: Request) -> Response:
        _check_length(req.text, settings.max_text_chars)
        voice_id = _resolve_voice(voices, req.voice_id or req.voice)
        result = await _synthesize(service, req.text, voice_id, req.format, req.options())
        if req.response == "json":
            return _json_response(
                result, voice_id, outputs, _public_base(settings, request), engine
            )
        return _audio_response(result)

    @app.post("/v1/tts/clone", response_model=None)
    async def text_to_speech_with_clip(
        request: Request,
        text: Annotated[str, Form(min_length=1)],
        file: Annotated[UploadFile, File(description="Reference clip to clone, not saved")],
        format: Annotated[AudioFormat, Form()] = "wav",
        response: Annotated[ResponseMode, Form()] = "audio",
        exaggeration: Annotated[float, Form(ge=0.0, le=2.0)] = 0.5,
        cfg_weight: Annotated[float, Form(ge=0.0, le=1.0)] = 0.5,
        temperature: Annotated[float, Form(ge=0.05, le=2.0)] = 0.8,
        seed: Annotated[int | None, Form(ge=0)] = None,
    ) -> Response:
        _check_length(text, settings.max_text_chars)
        options = SynthesisOptions(
            exaggeration=exaggeration, cfg_weight=cfg_weight, temperature=temperature, seed=seed
        )
        suffix = Path(file.filename or "clip.wav").suffix
        try:
            result = await run_in_threadpool(
                service.synthesize_with_upload,
                text,
                await file.read(),
                suffix,
                fmt=format,
                options=options,
            )
        except (ValueError, EngineError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if response == "json":
            return _json_response(result, None, outputs, _public_base(settings, request), engine)
        return _audio_response(result)

    @app.post("/v1/audio/speech", response_model=None)
    async def openai_compatible_speech(req: OpenAISpeechRequest) -> Response:
        """OpenAI-compatible endpoint so existing TTS integrations can point here unchanged."""
        _check_length(req.input, settings.max_text_chars)
        voice_id = _resolve_voice(voices, req.voice)
        result = await _synthesize(
            service, req.input, voice_id, req.response_format, SynthesisOptions()
        )
        return _audio_response(result)

    @app.get("/v1/audio/{name}")
    async def download_audio(name: str) -> FileResponse:
        path = outputs.path(name)
        if path is None:
            raise HTTPException(status_code=404, detail="audio not found")
        return FileResponse(path, media_type=outputs.media_type(name), filename=name)

    if mcp is not None:
        app.mount(
            "/",
            mcp.streamable_http_app(
                streamable_http_path="/mcp",
                stateless_http=True,
                json_response=True,
                host="0.0.0.0",  # no localhost-only DNS-rebinding checks; we sit behind a tunnel
            ),
        )

    return app


def _key_matches(request: Request, api_key: str) -> bool:
    header = request.headers.get("authorization", "")
    token = (
        header[7:].strip()
        if header.lower().startswith("bearer ")
        else request.headers.get("x-api-key")
    )
    return bool(token) and secrets.compare_digest(token, api_key)


def _public_base(settings: Settings, request: Request | None) -> str:
    if settings.public_url:
        return settings.public_url
    if request is not None:
        return str(request.base_url).rstrip("/")
    return f"http://localhost:{settings.port}"


def _resolve_voice(voices: VoiceStore, ref: str | None) -> str | None:
    if not ref:
        return None
    try:
        voice = voices.resolve(ref)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if voice is None:
        names = [v.name for v in voices.list()]
        raise HTTPException(
            status_code=404, detail=f"voice {ref!r} not found; available voices: {names}"
        )
    return voice.id


async def _synthesize(
    service: SynthesisService,
    text: str,
    voice_id: str | None,
    fmt: AudioFormat,
    options: SynthesisOptions,
) -> SynthesisResult:
    try:
        return await run_in_threadpool(
            service.synthesize, text, voice_id=voice_id, fmt=fmt, options=options
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, EngineError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _check_length(text: str, limit: int) -> None:
    if len(text) > limit:
        raise HTTPException(status_code=413, detail=f"text is {len(text)} chars; limit is {limit}")


def _audio_response(result: SynthesisResult) -> Response:
    return Response(
        content=result.audio,
        media_type=MEDIA_TYPES[result.format],
        headers={
            "Content-Disposition": f'attachment; filename="speech.{result.format}"',
            "X-Audio-Duration-Seconds": str(result.duration_seconds),
            "X-Synthesis-Seconds": str(result.elapsed_seconds),
            "X-Sample-Rate": str(result.sample_rate),
        },
    )


def _json_response(
    result: SynthesisResult,
    voice_id: str | None,
    outputs: OutputStore,
    base_url: str,
    engine: TTSEngine,
) -> JSONResponse:
    name = outputs.save(result.audio, result.format)
    body = SynthesisOut(
        id=name.rsplit(".", 1)[0],
        audio_url=f"{base_url}/v1/audio/{name}",
        format=result.format,
        duration_seconds=result.duration_seconds,
        sample_rate=result.sample_rate,
        synthesis_seconds=result.elapsed_seconds,
        voice_id=voice_id,
        engine=engine.name,
    )
    return JSONResponse(content=body.model_dump())


def app() -> FastAPI:
    """Factory for `uvicorn adwentts_worker.server:app --factory`."""
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    return create_app()
