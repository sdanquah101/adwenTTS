# Africa in 3 minutes: an explainer rendered with AdwenTTS

End-to-end demo: narration from the AdwenTTS worker, generated royalty-free music, and a
data-driven animated map rendered deterministically with Playwright and ffmpeg.

```sh
python build_map.py                          # Natural Earth -> map.js (SVG paths)
python make_music.py 230                     # music/full.wav, music/calm.wav
ADWENTTS_URL=https://xxx.trycloudflare.com ADWENTTS_KEY=... python make_voice.py --voice Kofi
python assemble.py --render                  # timeline, audio mix, frames -> out/africa_in_3_minutes.mp4
```

Edit `script.json` to change the story: narration, titles, facts, highlighted countries
(Natural Earth ADM0_A3 codes), pins (lon/lat) and the scene motif.
