# Adwen Maths

Adaptive BECE mathematics for JHS students. A short check finds the skill that is really
holding a student back, then plays short narrated lessons planned around them, with questions
after each lesson in the same viewer.

Two strands so far: linear equations, with the negative-number and algebra skills underneath, and fractions and percentages.

## How it works

| Part                | What it does                                                                                                                | Where                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Skill map           | Sixteen skills with prerequisites, from negative numbers to word problems and from simplifying fractions to profit and loss | `src/content/skills.ts`                                |
| Question generators | Unlimited BECE-style A to D questions. Every wrong option comes from a named mistake                                        | `src/content/generators.ts`, `generators-fractions.ts` |
| Mistake catalogue   | 44 common mistakes, each with a plain-language explanation, a fix and its root skill                                        | `src/content/misconceptions.ts`                        |
| Diagnostic          | Starts at the chosen topic and walks down the prerequisites only where answers go wrong                                     | `src/engine/diagnostic.ts`                             |
| Knowledge tracing   | One probability per skill, updated after every answer                                                                       | `src/engine/bkt.ts`                                    |
| Planner             | Foundations first. Adds short fix lessons for the mistakes the student made                                                 | `src/engine/planner.ts`                                |
| Lessons             | Narrated micro-lessons: balance scales, number lines, algebra tiles, fraction bars, hundred squares, worked steps           | `src/content/lessons.ts`, `src/ui/scenes.ts`           |
| Profile             | Skill map, mistake patterns, pace and comfort settings, for the student, parent or teacher                                  | `src/ui/screens.ts`                                    |

Comfort preferences such as colour, narrator voice and reading support make the app pleasant
to use. Lesson choice is driven by the student's answers, not by those preferences.

All data stays on the device in `localStorage`.

## Build and run

```sh
pnpm install
pnpm build        # see outputs below
pnpm test         # checks 8,000 generated questions against an independent solver
pnpm typecheck
```

| Output                  | Use it for                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dist/app/`             | The installable web app: page, manifest, icons and offline service worker. Deploy this folder to any HTTPS host. |
| `dist/adwen-maths.html` | One self-contained file, about 150 KB. Open it in any browser or share it directly.                              |
| `dist/index.html`       | The same app without the outer `<html>` wrapper, for hosts that add their own.                                   |

## Installing on a phone

The installable build is published to GitHub Pages by `.github/workflows/pages.yml` on every
push to `main` that touches `learn/`. It needs one setting, once: repository **Settings > Pages >
Build and deployment > Source: GitHub Actions**. The app is then at
`https://<owner>.github.io/<repo>/`.

- **Android (Chrome):** open the link. The app shows an "Install" card, or use the browser menu and "Install app".
- **iPhone (Safari):** tap Share, then "Add to Home Screen". The app explains this on iPhones.

After the first visit the app, its fonts and any narration clips played are stored on the phone,
so it opens and works without internet. Updates download automatically the next time the phone
is online. Student progress stays on the phone, and the app asks the browser to keep it even
when storage runs low.

To test locally, serve the folder over HTTP (service workers need `http://localhost` or HTTPS):

```sh
cd dist/app && python3 -m http.server 8080   # then open http://localhost:8080
```

To change the icons or install screenshots, edit `scripts/make-icons.mjs` and run
`node scripts/make-icons.mjs --shots` after a build. The PNGs in `src/icons/` are committed.

## Narration

The app speaks with the phone's built-in voice by default and prefers a West African English
voice when the phone has one. To use AdwenTTS voices instead:

1. Start the AdwenTTS worker and save one female and one male voice.
2. Run the generator against it. It reads `dist/narration.json` and writes clips plus a manifest to `dist/audio/`:

   ```sh
   ADWENTTS_URL=https://your-tunnel ADWENTTS_KEY=... \
     python scripts/make_narration.py --female Ama --male Kofi
   ```

3. Run `pnpm build` again. The build detects the clips and the app plays them.

## Adding content

- **A skill:** add it to `skills.ts`, a generator to `generators.ts`, and a lesson to `lessons.ts`.
  The tests fail until every skill has a lesson and every generated answer checks out.
- **A mistake:** add it to `misconceptions.ts`, return it from a generator's distractors,
  and optionally link a short fix lesson.
- **A lesson:** a list of scenes, each with a standard and a simpler narration line.
