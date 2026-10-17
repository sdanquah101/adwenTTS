# Adwen Maths

Adaptive BECE mathematics for JHS students. A short check finds the skill that is really
holding a student back, then plays short narrated lessons planned around them, with questions
after each lesson in the same viewer.

This first slice covers the linear-equations strand and the skills it depends on.

## How it works

| Part                | What it does                                                                               | Where                                        |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Skill map           | Ten skills with prerequisites, from negative numbers up to word problems                   | `src/content/skills.ts`                      |
| Question generators | Unlimited BECE-style A to D questions. Every wrong option comes from a named mistake       | `src/content/generators.ts`                  |
| Mistake catalogue   | 23 common mistakes, each with a plain-language explanation, a fix and its root skill       | `src/content/misconceptions.ts`              |
| Diagnostic          | Starts at the chosen topic and walks down the prerequisites only where answers go wrong    | `src/engine/diagnostic.ts`                   |
| Knowledge tracing   | One probability per skill, updated after every answer                                      | `src/engine/bkt.ts`                          |
| Planner             | Foundations first. Adds short fix lessons for the mistakes the student made                | `src/engine/planner.ts`                      |
| Lessons             | Narrated micro-lessons: balance scales, number lines, algebra tiles, worked steps          | `src/content/lessons.ts`, `src/ui/scenes.ts` |
| Profile             | Skill map, mistake patterns, pace and comfort settings, for the student, parent or teacher | `src/ui/screens.ts`                          |

Comfort preferences such as colour, narrator voice and reading support make the app pleasant
to use. Lesson choice is driven by the student's answers, not by those preferences.

All data stays on the device in `localStorage`.

## Build and run

```sh
pnpm install
pnpm build        # dist/adwen-maths.html: one offline file, about 110 KB
pnpm test         # checks 5,000 generated questions against an independent solver
pnpm typecheck
```

Open `dist/adwen-maths.html` in any browser. The same file can be shared directly.
`dist/index.html` is the same app without the outer `<html>` wrapper, for hosts that add their own.

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
