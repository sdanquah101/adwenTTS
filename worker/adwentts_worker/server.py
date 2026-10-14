from __future__ import annotations

import logging
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import __version__
from .audio import MEDIA_TYPES, AudioFormat, available_formats
from .engines import EngineError, SynthesisOptions, TTSEngine, create_engine
from .service import SynthesisResult, SynthesisService
from .settings import Settings
from .voices import VoiceStore

log = logging.getLogger(__name__)


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice_id: str | None = Field(
        default=None, description="Saved voice to clone; omit for built-in"
    )
    format: AudioFormat = "wav"
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


class VoiceOut(BaseModel):
    id: str
    name: str
    created_at: str
    duration_seconds: float
    sample_rate: int


def create_app(
    engine: TTSEngine | None = None,
    voices: VoiceStore | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    settings = settings or Settings()
    engine = engine or create_engine(settings.engine, device=settings.device)
    voices = voices or VoiceStore(settings.voices_dir)
    service = SynthesisService(engine, voices)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if not engine.ready:
            await run_in_threadpool(engine.load)
        yield

    app = FastAPI(title="AdwenTTS worker", version=__version__, lifespan=lifespan)
    app.state.service = service

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok" if engine.ready else "loading",
            "engine": engine.name,
            "sample_rate": engine.sample_rate,
            "formats": available_formats(),
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

    @app.post("/v1/tts")
    async def text_to_speech(req: TTSRequest, request: Request) -> Response:
        _check_length(req.text, settings.max_text_chars)
        try:
            result = await run_in_threadpool(
                service.synthesize,
                req.text,
                voice_id=req.voice_id,
                fmt=req.format,
                options=req.options(),
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (ValueError, EngineError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return _audio_response(result)

    @app.post("/v1/tts/clone")
    async def text_to_speech_with_clip(
        text: Annotated[str, Form(min_length=1)],
        file: Annotated[UploadFile, File(description="Reference clip to clone, not saved")],
        format: Annotated[AudioFormat, Form()] = "wav",
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
        return _audio_response(result)

    return app


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


def app() -> FastAPI:
    """Factory for `uvicorn adwentts_worker.server:app --factory`."""
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    return create_app()
