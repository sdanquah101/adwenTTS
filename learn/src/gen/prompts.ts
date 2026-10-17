import { MISCONCEPTIONS, type MisconceptionId } from "../content/misconceptions";
import { ancestors, SKILL, SKILLS, type SkillId } from "../content/skills";
import { needsFor } from "../engine/planner";
import type { Data, Series, SeriesVideo } from "../state";
import { seriesSoFar, studentBrief } from "./brief";
import { cleanText, VIDEO_FORMAT, videoWords, type Video } from "./script";

const ROLE =
  "You are the teacher behind Adwen Maths, an app that makes narrated explainer videos for one Ghanaian junior high school student at a time. You teach for real understanding, not memorised tricks: you start from what the student already knows, use a vivid analogy from their life, map the analogy onto the maths step by step, work examples from easy up to BECE standard, and name and fix the exact mistakes this student has been making.";

/** Misconceptions a video on these skills may say it fixes. */
function catalogue(skills: SkillId[]): string {
  const set = new Set<SkillId>();
  for (const s of skills) {
    set.add(s);
    for (const a of ancestors(s)) set.add(a);
  }
  return (Object.keys(MISCONCEPTIONS) as MisconceptionId[])
    .filter((id) => set.has(MISCONCEPTIONS[id].root))
    .map((id) => `- ${id}: ${MISCONCEPTIONS[id].label}`)
    .join("\n");
}

// ---------------------------------------------------------------- series outline

export function outlinePrompt(d: Data, target: SkillId): string {
  const needs = needsFor(target, d.mastery, d.misconceptions);
  const skills = [...needs.foundations, target];
  return `${ROLE}

Plan a series of explainer videos that takes this student through the whole topic. Each video will be 3 to 5 minutes long.

${studentBrief(d, target)}

Rules for the series:
- 3 to 5 videos in total. Together they must cover the entire topic "${SKILL[target].title}" as the BECE examines it, including word problems where the topic has them.
- Start with the foundations listed above (one video can cover one or two of them), then build the topic itself across at least two videos: first the core idea and simplest cases, then harder cases, the student's own mistakes, and exam-style questions.
- Each video's "focus" lists the skill ids it teaches, from this list: ${skills.join(", ")}.
- "why" is one sentence addressed to the student saying why this video is in their series, based on their answers (for example "Your answers show the minus signs are tripping you up, so we fix that first.").
- "intro" is two short sentences to the student about the plan.

Reply with only a JSON object, no other text:
{"intro": string, "videos": [{"title": string, "focus": [skill ids], "goal": string, "why": string}]}`;
}

const SKILL_IDS = new Set(SKILLS.map((s) => s.id));

/** Check Claude's outline; fall back to a sensible plan built from the skill graph. */
export function repairOutline(
  raw: unknown,
  d: Data,
  target: SkillId,
): { intro: string; videos: SeriesVideo[] } {
  const needs = needsFor(target, d.mastery, d.misconceptions);
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const videos: SeriesVideo[] = [];
  for (const v of Array.isArray(o.videos) ? o.videos.slice(0, 5) : []) {
    const x = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const title = cleanText(x.title, 90);
    const focus = (Array.isArray(x.focus) ? x.focus : []).filter(
      (s): s is SkillId => typeof s === "string" && SKILL_IDS.has(s as SkillId),
    );
    if (!title) continue;
    videos.push({
      title,
      focus: focus.length ? focus : [target],
      goal: cleanText(x.goal, 200) ?? title,
      why: cleanText(x.why, 200) ?? "",
    });
  }
  if (videos.length >= 2 && videos.some((v) => v.focus.includes(target)))
    return { intro: cleanText(o.intro, 300) ?? "", videos };
  return fallbackOutline(needs.foundations, target);
}

export function fallbackOutline(
  foundations: SkillId[],
  target: SkillId,
): { intro: string; videos: SeriesVideo[] } {
  const t = SKILL[target];
  const videos: SeriesVideo[] = foundations.map((s) => ({
    title: SKILL[s].title,
    focus: [s],
    goal: `Understand ${SKILL[s].title.toLowerCase()} well enough to build on it.`,
    why: `${t.title} rests on this, and your answers show it needs work.`,
  }));
  videos.push(
    {
      title: `${t.title}: the big idea`,
      focus: [target],
      goal: `See why ${t.title.toLowerCase()} works, through an analogy and simple examples.`,
      why: "This is the heart of the topic.",
    },
    {
      title: `${t.title}: harder cases and exam questions`,
      focus: [target],
      goal: "Handle the harder cases and the mistakes students make in the exam.",
      why: "This takes you up to BECE standard.",
    },
  );
  return {
    intro: foundations.length
      ? "We start with the skills underneath this topic, then build the topic itself."
      : "We go from the big idea to exam-standard questions.",
    videos: videos.slice(-5),
  };
}

// ---------------------------------------------------------------- one video

export function videoPrompt(d: Data, series: Series, index: number): string {
  const v = series.videos[index]!;
  const before = seriesSoFar(series, index);
  const after = series.videos
    .slice(index + 1)
    .map((x, i) => `Video ${index + i + 2}: ${x.title}`)
    .join("\n");
  const name = d.profile?.name ?? "the student";
  return `${ROLE}

Write video ${index + 1} of ${series.videos.length} in this student's series on "${SKILL[series.target].title}".

${studentBrief(d, series.target)}

This video: "${v.title}"
Goal: ${v.goal}
Skills it teaches: ${v.focus.map((s) => `${SKILL[s].title} [${s}]`).join(", ")}
${before ? `Already watched:\n${before}\n` : "This is the first video of the series.\n"}${after ? `Coming later (do not teach these yet; preview the next one at the end):\n${after}\n` : "This is the last video: finish with a short recap of the whole series and say the quiz comes next.\n"}
How to teach it:
- Length: 600 to 800 words of narration in total, so the video runs 4 to 5 minutes. Never under 550 words. Use 4 to 6 chapters and 20 to 32 scenes.
- Chapter 1 opens with a title scene, then hooks the student with a story scene: an analogy from their interests or from daily life in Ghana (the market, trotro fares, sharing kenkey, phone credit, a football league table, cedis and pesewas), then a mapping scene that links the analogy to the maths.
- Break every idea into small steps. Explain why each step is allowed, not only what to do. Use the balance, number line, tiles, bars or hundred square scenes wherever a picture makes the idea clearer.
- Work at least three examples that get harder, ending at BECE standard. Put at least two think scenes in the video where the student pauses and tries before the answer is revealed.
- Give one chapter to the student's own mistakes listed above that belong to this video's skills: show their wrong working next to the right working (contrast scenes) and explain why the wrong way fails. List those misconception ids in that chapter's "addresses". If they have no recorded mistakes here, cover the most common one from the catalogue below.
- End with a rule scene that sums up, then a quote scene with one line to remember.

How to write the narration ("say" and "reveal"):
- It is read aloud by a Ghanaian English voice. Write every number and symbol as words: "three x plus five equals twenty", "two thirds", "forty percent", "negative four", "G H cedis fifty".
- No symbols, brackets, markdown or emoji in narration. Warm, clear, spoken English, like a good teacher talking to one student.
- Use ${name}'s name now and then (three or four times in the video), not in every line.
- Each "say" is one to four sentences and matches what its scene shows.
- Check every number twice. All maths must be correct.

Misconception ids you may use in "addresses":
${catalogue(v.focus)}

${VIDEO_FORMAT}`;
}

/** Asks for more chapters when a video came out under three minutes. */
export function extendPrompt(d: Data, series: Series, index: number, video: Video): string {
  const v = series.videos[index]!;
  const have = video.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");
  return `${ROLE}

You wrote video ${index + 1} of a series on "${SKILL[series.target].title}" for this student, but it came out at ${videoWords(video)} words, which is too short. Write two more chapters to add at the end: more worked examples that build up to BECE standard, with at least one think scene, then a short recap. About 300 words of narration in total.

${studentBrief(d, series.target)}

The video: "${video.title || v.title}". Goal: ${v.goal}
Chapters it already has:
${have}

Misconception ids you may use in "addresses":
${catalogue(v.focus)}

${VIDEO_FORMAT}

Start directly with the first {"k":"chapter",...} line (no video line), and finish with {"k":"end"}. Write every number and symbol in narration as words.`;
}
