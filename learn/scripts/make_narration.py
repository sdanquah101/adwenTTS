"""Pre-generate lesson narration with an AdwenTTS worker.

Reads dist/narration.json (written by `pnpm build`) and saves one clip per line, voice and
register to dist/audio/<female|male>/<standard|simple>/<id>.mp3, plus dist/audio/manifest.json.
Existing clips are skipped, so the script can be re-run after a tunnel drops.

usage:
  ADWENTTS_URL=https://xxx.trycloudflare.com ADWENTTS_KEY=... \\
    python scripts/make_narration.py --female Ama --male Kofi [--only int-add-visual]
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

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def post(base: str, key: str | None, body: dict) -> bytes:
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(f"{base}/v1/tts", data=json.dumps(body).encode(), headers=headers, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as res:
                return res.read()
        except urllib.error.HTTPError:
            raise
        except Exception as exc:  # tunnel hiccup
            if attempt == 2:
                raise
            print(f"    retry after {exc}")
            time.sleep(3)
    raise RuntimeError("unreachable")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.environ.get("ADWENTTS_URL"))
    ap.add_argument("--key", default=os.environ.get("ADWENTTS_KEY"))
    ap.add_argument("--female", help="saved AdwenTTS voice name for the female narrator")
    ap.add_argument("--male", help="saved AdwenTTS voice name for the male narrator")
    ap.add_argument("--only", help="comma-separated lesson ids")
    ap.add_argument("--registers", default="standard,simple")
    args = ap.parse_args()
    if not args.url or not (args.female or args.male):
        print("need --url and at least one of --female / --male", file=sys.stderr)
        return 2
    lines = json.loads((DIST / "narration.json").read_text())
    only = set(args.only.split(",")) if args.only else None
    voices = {k: v for k, v in (("female", args.female), ("male", args.male)) if v}
    base = args.url.rstrip("/")
    manifest_path = DIST / "audio" / "manifest.json"
    manifest = set(json.loads(manifest_path.read_text())) if manifest_path.exists() else set()

    for gender, voice in voices.items():
        for register in args.registers.split(","):
            for line in lines:
                if only and line["id"].split(".")[0] not in only:
                    continue
                rel = f"{gender}/{register}/{line['id']}.mp3"
                out = DIST / "audio" / rel
                if out.exists():
                    manifest.add(rel)
                    continue
                text = line["simple"] if register == "simple" else line["text"]
                started = time.time()
                audio = post(base, args.key, {"text": text, "voice": voice, "format": "mp3", "cfg_weight": 0.4, "seed": 7})
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(audio)
                manifest.add(rel)
                manifest_path.write_text(json.dumps(sorted(manifest)))
                print(f"  {rel}  ({time.time() - started:.1f}s)")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(sorted(manifest)))
    print(f"{len(manifest)} clips listed in {manifest_path.relative_to(ROOT)}. Run `pnpm build` to bundle them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
