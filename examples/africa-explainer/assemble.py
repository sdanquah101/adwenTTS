"""Build timeline.json/timeline.js from the script and narration clips, mix the audio, and
(optionally) render frames and mux the final video.

usage: python assemble.py [--render] [--fps 30]
Narration clips are read from voice/<scene_id>.<wav|mp3>; a missing clip gets an estimated
duration (2.3 words per second) so the visuals can be previewed before the voice exists.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).parent
SR = 44_100
LEAD = 0.9        # seconds of visuals before the voice starts in each scene
TAIL = 1.1        # seconds after the voice ends
INTRO_PAD = 0.5


def load_voice(scene_id: str) -> tuple[np.ndarray | None, float]:
    for ext in ("wav", "mp3", "flac"):
        p = HERE / "voice" / f"{scene_id}.{ext}"
        if p.exists():
            data, sr = sf.read(p, dtype="float32", always_2d=True)
            mono = data.mean(axis=1)
            if sr != SR:
                x = np.arange(len(mono)) / sr
                xi = np.arange(int(len(mono) * SR / sr)) / SR
                mono = np.interp(xi, x, mono).astype(np.float32)
            return mono, len(mono) / SR
    return None, 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", action="store_true", help="capture frames and mux the mp4")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--out", default="out/africa_in_3_minutes.mp4")
    args = ap.parse_args()

    script = json.loads((HERE / "script.json").read_text())
    scenes = []
    t = INTRO_PAD
    voices = []
    missing = []
    for s in script["scenes"]:
        clip, dur = load_voice(s["id"])
        if clip is None:
            dur = len(s["narration"].split()) / 2.3
            missing.append(s["id"])
        scene_dur = LEAD + dur + TAIL
        scenes.append({**{k: v for k, v in s.items() if k != "narration"}, "start": round(t, 3), "dur": round(scene_dur, 3)})
        voices.append((t + LEAD, clip))
        t += scene_dur
    total = t + 1.0
    timeline = {"scenes": scenes, "total": round(total, 3), "fps": args.fps}
    (HERE / "timeline.json").write_text(json.dumps(timeline, indent=1))
    (HERE / "timeline.js").write_text("window.TIMELINE = " + json.dumps(timeline) + ";\n")
    print(f"timeline: {len(scenes)} scenes, {total:.1f}s total" + (f"; estimated durations for {missing}" if missing else ""))

    # ---- audio mix ----
    n = int(total * SR) + SR
    voice = np.zeros(n, np.float32)
    for start, clip in voices:
        if clip is None:
            continue
        i = int(start * SR)
        voice[i : i + len(clip)] += clip[: n - i]
    # voice level: peak-normalise to -3 dBFS
    if np.max(np.abs(voice)) > 0:
        voice *= 10 ** (-3 / 20) / np.max(np.abs(voice))

    music_dir = HERE / "music"
    full, _ = sf.read(music_dir / "full.wav", dtype="float32")
    calm, _ = sf.read(music_dir / "calm.wav", dtype="float32")
    def fit(x: np.ndarray) -> np.ndarray:
        if len(x) >= n:
            return x[:n]
        reps = int(np.ceil(n / len(x)))
        return np.tile(x, reps)[:n]
    full, calm = fit(full), fit(calm)

    # mood crossfade per scene
    mood = np.zeros(n, np.float32)
    for s in scenes:
        if s.get("mood") == "calm":
            a, b = int(s["start"] * SR), int((s["start"] + s["dur"]) * SR)
            mood[a:b] = 1.0
    k = int(1.5 * SR)
    mood = np.convolve(mood, np.ones(k) / k, mode="same")
    music = full * (1 - mood) + calm * mood

    # ducking: follow the voice envelope
    env = np.abs(voice)
    win = int(0.25 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env = env / (env.max() + 1e-9)
    gate = np.clip(env * 12, 0, 1)
    duck_db = -9.0 + (-5.0) * gate  # -9 dB bed, -14 dB under voice
    music *= 10 ** (duck_db / 20)
    # fade out at the end
    fo = int(2.5 * SR)
    end = int(total * SR)
    music[end - fo : end] *= np.linspace(1, 0, fo)
    music[end:] = 0

    mix = voice + music
    mix = (mix / max(1.0, np.max(np.abs(mix)) / 0.97)).astype(np.float32)
    out_dir = HERE / "out"
    out_dir.mkdir(exist_ok=True)
    sf.write(out_dir / "mix.wav", mix[:end], SR, subtype="PCM_16")
    print(f"audio: {end / SR:.1f}s mixed to out/mix.wav")

    if not args.render:
        return
    out = HERE / args.out
    out.parent.mkdir(exist_ok=True)
    subprocess.run(
        ["node", str(HERE / "capture.mjs"), str(out), str(out_dir / "mix.wav"), str(args.fps)],
        cwd=HERE,
        check=True,
    )
    print(f"video: {out}")


if __name__ == "__main__":
    main()
