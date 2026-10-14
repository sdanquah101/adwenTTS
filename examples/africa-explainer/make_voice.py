"""Generate the narration for every scene through a running AdwenTTS worker.

usage: ADWENTTS_URL=https://xxx.trycloudflare.com ADWENTTS_KEY=... python make_voice.py [--voice Kofi] [--only intro,nile]
Writes voice/<scene_id>.wav and prints each clip's duration.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import soundfile as sf

HERE = Path(__file__).parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.environ.get("ADWENTTS_URL"))
    ap.add_argument("--key", default=os.environ.get("ADWENTTS_KEY"))
    ap.add_argument("--voice", default=os.environ.get("ADWENTTS_VOICE"), help="saved voice name or id; omit for built-in")
    ap.add_argument("--only", help="comma-separated scene ids to (re)generate")
    ap.add_argument("--cfg-weight", type=float, default=0.4)
    ap.add_argument("--exaggeration", type=float, default=0.45)
    args = ap.parse_args()
    if not args.url:
        print("set --url or ADWENTTS_URL", file=sys.stderr)
        return 2

    base = args.url.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if args.key:
        headers["Authorization"] = f"Bearer {args.key}"

    health = json.loads(urllib.request.urlopen(urllib.request.Request(f"{base}/health"), timeout=30).read())
    print("worker:", health.get("engine"), health.get("status"))

    voice_id = None
    if args.voice:
        voices = json.loads(urllib.request.urlopen(urllib.request.Request(f"{base}/v1/voices", headers=headers), timeout=30).read())
        match = next((v for v in voices if v["id"] == args.voice or v["name"].lower() == args.voice.lower()), None)
        if match is None:
            print(f"voice {args.voice!r} not found; available: {[v['name'] for v in voices]}", file=sys.stderr)
            return 1
        voice_id = match["id"]
        print(f"voice: {match['name']} ({voice_id}, {match['duration_seconds']}s reference)")

    script = json.loads((HERE / "script.json").read_text())
    only = set(args.only.split(",")) if args.only else None
    (HERE / "voice").mkdir(exist_ok=True)
    total = 0.0
    for scene in script["scenes"]:
        if only and scene["id"] not in only:
            continue
        body = {
            "text": scene["narration"],
            "format": "wav",
            "cfg_weight": args.cfg_weight,
            "exaggeration": args.exaggeration,
            "seed": 42,
        }
        if voice_id:
            body["voice_id"] = voice_id  # works on worker versions with and without name lookup
        req = urllib.request.Request(f"{base}/v1/tts", data=json.dumps(body).encode(), headers=headers, method="POST")
        started = time.time()
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=600) as res:
                    audio = res.read()
                break
            except urllib.error.HTTPError as exc:
                print(f"  {scene['id']}: HTTP {exc.code} {exc.read().decode(errors='replace')[:300]}", file=sys.stderr)
                return 1
            except Exception as exc:  # network hiccup through the tunnel
                if attempt == 2:
                    raise
                print(f"  {scene['id']}: retry after {exc}")
                time.sleep(3)
        out = HERE / "voice" / f"{scene['id']}.wav"
        out.write_bytes(audio)
        data, sr = sf.read(out)
        dur = len(data) / sr
        total += dur
        print(f"  {scene['id']:<13} {dur:5.1f}s audio  ({time.time() - started:4.1f}s compute)")
    print(f"total narration: {total:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
