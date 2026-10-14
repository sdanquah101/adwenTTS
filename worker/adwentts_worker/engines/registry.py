from __future__ import annotations

from .base import TTSEngine

ENGINE_NAMES = ("mock", "chatterbox", "chatterbox-turbo")


def create_engine(name: str, device: str | None = None) -> TTSEngine:
    """Instantiate an engine by name. Does not load weights; call `.load()`."""
    if name == "mock":
        from .mock import MockEngine

        return MockEngine()
    if name == "chatterbox":
        from .chatterbox import ChatterboxEngine

        return ChatterboxEngine(device=device, variant="standard")
    if name == "chatterbox-turbo":
        from .chatterbox import ChatterboxEngine

        return ChatterboxEngine(device=device, variant="turbo")
    raise ValueError(f"unknown engine {name!r}; choose one of {', '.join(ENGINE_NAMES)}")
