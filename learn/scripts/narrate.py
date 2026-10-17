"""Record one chapter of an Adwen Maths video with an AdwenTTS worker.

The Adwen Maths page on claude.ai leaves narration requests in its database
(collection "narration"); the Claude Code session that serves as narrator
saves a request to a JSON file and runs this script on it. Each line is
spoken by AdwenTTS, the lines are joined with short pauses into one AAC file
in an MP4 container (the format claude.ai stores and plays), and the script
prints where each line starts, which the page uses to keep the animation in
step with the voice.

usage:
  ADWENTTS_URL=https://xxx.trycloudflare.com ADWENTTS_KEY=... \\
    python learn/scripts/narrate.py request.json --out /tmp/narration
  python learn/scripts/narrate.py request.json --out /tmp/narration --mock   # no server: tones

Prints one JSON object: {"file": ".../<id>.mp4", "marks": [...], "duration": s, "seconds_taken": s}
Recorded lines are cached under --out, so a re-run after a dropped tunnel only records what is missing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RATE = 24000
LEAD = 0.3  # silence before the first line
GAP = 0.55  # silence between lines; the page pauses for "think" scenes inside it
TAIL = 0.6


def load_request(path: Path) -> dict:
    raw = json.loads(path.read_text())
    # Accept the document itself, or an ArtifactData read that wraps it.
    for key in ("data", "document", "fields"):
        if isinstance(raw, dict) and "lines" not in raw and isinstance(raw.get(key), dict):
            raw = raw[key]
    if not isinstance(raw, dict) or not isinstance(raw.get("lines"), list):
        raise SystemExit(f"{path}: no 'lines' list in the request")
    return raw


def post_tts(base: str, key: str | None, text: str, voice: str) -> bytes:
    body = {"text": text, "voice": voice, "format": "wav", "cfg_weight": 0.4, "exaggeration": 0.5, "seed": 7}
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(f"{base}/v1/tts", data=json.dumps(body).encode(), headers=headers, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as res:
                return res.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            raise SystemExit(f"AdwenTTS refused a line ({exc.code}): {detail}") from exc
        except Exception as exc:  # tunnel hiccup
            if attempt == 2:
                raise SystemExit(f"AdwenTTS could not be reached: {exc}") from exc
            time.sleep(3 * (attempt + 1))
    raise AssertionError("unreachable")


def to_pcm(audio: bytes) -> bytes:
    """Any audio file to 16-bit mono PCM at RATE."""
    out = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "pipe:1"],
        input=audio,
        capture_output=True,
        check=True,
    )
    return out.stdout


def mock_pcm(text: str) -> bytes:
    """A soft tone as long as the line would take to say, for testing without a server."""
    seconds = max(1.0, len(text.split()) / 2.5)
    n = int(seconds * RATE)
    freq = 220 + (int(hashlib.md5(text.encode()).hexdigest()[:2], 16) % 8) * 30
    samples = (int(3000 * math.sin(2 * math.pi * freq * i / RATE) * min(1, i / 2000, (n - i) / 2000)) for i in range(n))
    return b"".join(struct.pack("<h", s) for s in samples)


def silence(seconds: float) -> bytes:
    return b"\x00\x00" * int(seconds * RATE)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("request", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--id", help="request id, used for the file name (default: the request file's name)")
    ap.add_argument("--url", default=os.environ.get("ADWENTTS_URL"))
    ap.add_argument("--key", default=os.environ.get("ADWENTTS_KEY"))
    ap.add_argument("--mock", action="store_true", help="tones instead of speech, no server needed")
    args = ap.parse_args()
    if not args.mock and not args.url:
        print("need --url (or ADWENTTS_URL), or --mock", file=sys.stderr)
        return 2

    req = load_request(args.request)
    voice = str(req.get("voice") or "TTS")
    rid = args.id or args.request.stem
    cache = args.out / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    base = (args.url or "").rstrip("/")
    started = time.time()

    pcm = bytearray(silence(LEAD))
    marks: list[float] = []
    for line in req["lines"]:
        text = str(line.get("text", "")).strip()
        marks.append(round(len(pcm) / 2 / RATE, 3))
        if not text:
            continue
        digest = hashlib.sha256(f"{'mock' if args.mock else voice}\0{text}".encode()).hexdigest()[:24]
        hit = cache / f"{digest}.pcm"
        if hit.exists():
            clip = hit.read_bytes()
        else:
            clip = mock_pcm(text) if args.mock else to_pcm(post_tts(base, args.key, text, voice))
            hit.write_bytes(clip)
        pcm += clip
        pcm += silence(GAP)
    pcm += silence(TAIL)
    duration = round(len(pcm) / 2 / RATE, 3)

    out = args.out / f"{rid}.mp4"
    subprocess.run(
        [
            "ffmpeg", "-loglevel", "error", "-y",
            "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-i", "pipe:0",
            "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(out),
        ],
        input=bytes(pcm),
        check=True,
    )
    print(json.dumps({"file": str(out), "marks": marks, "duration": duration, "seconds_taken": round(time.time() - started, 1)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
