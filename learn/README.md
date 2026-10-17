# Adwen Maths

Adaptive BECE mathematics for JHS students. A short check finds what is really holding a
student back. Then Claude writes a series of explainer videos for that one student, on the spot:
3 to 5 minutes each, with analogies from the student's own life, every step broken down and
their actual mistakes fixed. The videos are narrated in an AdwenTTS voice. A quiz at the end of
the series sends each wrong answer back to the chapter that teaches it, or asks for a new video
on that mistake.

Two strands so far: linear equations, with the negative-number and algebra skills underneath, and fractions and percentages.

## How it works

| Part                | What it does                                                                                                                                        | Where                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Skill map           | Sixteen skills with prerequisites, from negative numbers to word problems and from simplifying fractions to profit and loss                         | `src/content/skills.ts`                                |
| Question generators | Unlimited BECE-style A to D questions. Every wrong option comes from a named mistake                                                                | `src/content/generators.ts`, `generators-fractions.ts` |
| Mistake catalogue   | 44 common mistakes, each with a plain-language explanation, a fix and its root skill                                                                | `src/content/misconceptions.ts`                        |
| Diagnostic          | Starts at the chosen topic and walks down the prerequisites only where answers go wrong. Records the question and the answer chosen                 | `src/engine/diagnostic.ts`                             |
| Knowledge tracing   | One probability per skill, updated after every answer                                                                                               | `src/engine/bkt.ts`                                    |
| Planner             | Which skills underneath the topic need rebuilding, foundations first, and which mistakes belong to this topic                                       | `src/engine/planner.ts`                                |
| Student brief       | Everything Claude is told about the student: class, interests, reading support, pace, confidence, skill levels, mistakes with their real answers    | `src/gen/brief.ts`                                     |
| Series and scripts  | Claude plans 3 to 5 videos, then writes each one as it is opened, streaming chapter by chapter. A video under three minutes gets two more chapters  | `src/gen/prompts.ts`, `src/gen/generate.ts`            |
| Scene language      | Title, story, mapping, worked steps, balance scale, number line, algebra tiles, fraction bars, hundred square, contrast, rule, quote, pause-and-try | `src/gen/script.ts`, `src/ui/scenes.ts`                |
| Player              | Plays each chapter in step with its narration, pauses for "think" scenes, lists chapters, and starts writing the next video while this one plays    | `src/ui/series.ts`                                     |
| Narration relay     | Asks the narrator session to record each chapter with AdwenTTS and plays it as soon as it is stored (see below)                                     | `src/gen/narration.ts`, `scripts/narrate.py`           |
| Quiz and results    | Questions on every skill in the series; wrong answers link to the chapter whose `addresses` list that mistake, or to a new follow-up video          | `src/ui/series.ts`                                     |

Everything Claude writes is checked before it is shown: unknown scene types, unbalanced balance
scales, number lines that cannot show their hop and made-up mistake ids are repaired or replaced
by a plain card, so a bad line never breaks a video.

## Where it runs

Tailored videos need claude.ai: the app is published there as an Artifact, and Claude writes the
scripts through the page's `sample` capability, on the viewer's own Claude account, with no API
key. The page keeps each student's record in their private folder of the page's database, and
narration requests in the shared `narration` collection.

The same build also runs as an installable web app (GitHub Pages) for the diagnostic, the skill
profile and quizzes. Outside claude.ai it says plainly that videos are written on claude.ai.

## Narration relay

A claude.ai page cannot reach other servers, so it cannot call AdwenTTS directly. Instead:

1. When a chapter is complete, the page writes `narration/<id>` (`status: "queued"`, the voice
   and the lines) and messages the narrator Claude Code session through the Claude Code Remote
   connector. The id is a hash of the voice and text, so a chapter is never recorded twice.
2. The narrator session reads every queued request, sets it to `working`, runs
   `scripts/narrate.py` (AdwenTTS for each line, joined into one AAC file in an MP4 container,
   with the second each line starts at), uploads the file to the page's asset store, and sets the
   request to `done` with `asset`, `marks` and `duration`.
3. The page watches the request and plays the chapter from `/_blob/<asset>`.

`config/narrator` in the page's database holds the narrator session id, the page link, the
AdwenTTS voice names and an optional `offline` note shown to students when the voice server is
down. With no narration, a student can watch without sound, with captions. See
[NARRATOR.md](NARRATOR.md) for the narrator's steps.

```sh
ADWENTTS_URL=https://your-tunnel ADWENTTS_KEY=... \
  python scripts/narrate.py request.json --out /tmp/narration
python scripts/narrate.py request.json --out /tmp/narration --mock   # tones, no server
```

## Build and run

```sh
pnpm install
pnpm build        # see outputs below
pnpm test         # 8,000 generated questions against an independent solver, plus script parsing and prompts
pnpm typecheck
```

| Output                  | Use it for                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `dist/index.html`       | The page to publish on claude.ai as an Artifact, where videos are written and narrated.      |
| `dist/app/`             | The installable web app: page, manifest, icons and offline service worker. Deployed to Pages |
| `dist/adwen-maths.html` | One self-contained file, about 150 KB.                                                       |

## Installing on a phone

The installable build is published to GitHub Pages by `.github/workflows/pages.yml` on every
push to `main` that touches `learn/` (repository **Settings > Pages > Source: GitHub Actions**).

- **Android (Chrome):** open the link. The app shows an "Install" card, or use the browser menu and "Install app".
- **iPhone (Safari):** tap Share, then "Add to Home Screen". The app explains this on iPhones.

To change the icons or install screenshots, edit `scripts/make-icons.mjs` and run
`node scripts/make-icons.mjs --shots` after a build. The PNGs in `src/icons/` are committed.

## Adding content

- **A skill:** add it to `skills.ts` and a generator to `generators.ts`. The tests fail until every
  generated answer checks out. Videos for it are written by Claude from the skill's title and example.
- **A mistake:** add it to `misconceptions.ts` and return it from a generator's distractors. Claude
  is given the catalogue and can build a chapter around it.
- **A scene type:** add it to `Visual` and `repairVisual` in `src/gen/script.ts`, describe it in
  `VIDEO_FORMAT`, and draw it in `src/ui/scenes.ts`.
