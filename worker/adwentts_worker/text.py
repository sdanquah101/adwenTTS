from __future__ import annotations

import re

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def split_text(text: str, max_chars: int = 250) -> list[str]:
    """Split text into sentence-aligned chunks no longer than `max_chars`.

    TTS models degrade on very long inputs, so long text is synthesized chunk by
    chunk and joined with short silences. Sentences are kept whole where possible;
    an over-long sentence is cut at a comma, then at a space.
    """
    text = " ".join(text.split())
    if not text:
        return []

    chunks: list[str] = []
    current = ""
    for sentence in _SENTENCE_END.split(text):
        while len(sentence) > max_chars:
            cut = sentence.rfind(",", 0, max_chars)
            if cut < max_chars // 2:
                cut = sentence.rfind(" ", 0, max_chars)
            if cut <= 0:
                cut = max_chars
            head, sentence = sentence[:cut].strip(), sentence[cut:].strip(" ,")
            if current:
                chunks.append(current)
                current = ""
            chunks.append(head)
        if not sentence:
            continue
        if not current:
            current = sentence
        elif len(current) + 1 + len(sentence) <= max_chars:
            current = f"{current} {sentence}"
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks
