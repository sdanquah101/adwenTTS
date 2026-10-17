import { MISCONCEPTIONS } from "../content/misconceptions";
import { ancestors, SKILL, topoOrder, type SkillId } from "../content/skills";
import { insights } from "../engine/analytics";
import { stateOf, STATE_WORDS } from "../engine/bkt";
import { needsFor } from "../engine/planner";
import type { Data, Series } from "../state";

/**
 * Everything Claude is told about one student, in plain text. This is the
 * whole of the tailoring: what goes in here is what can change the video.
 */
export function studentBrief(d: Data, target: SkillId): string {
  const p = d.profile;
  const ins = insights(d);
  const needs = needsFor(target, d.mastery, d.misconceptions);
  const out: string[] = [];

  out.push(
    `Student: ${p?.name ?? "the student"}, ${p?.level ?? "JHS 3"} in Ghana, preparing for the BECE mathematics paper.`,
  );
  if (p?.interests.length)
    out.push(
      `Interests: ${p.interests.join(", ")}. Draw analogies and word problems from these where they fit naturally.`,
    );
  if (p?.simpler)
    out.push(
      "Reading support: on. Use short sentences (under 15 words) and everyday words. Explain any maths word the first time it is used.",
    );
  if (ins.pace === "careful")
    out.push("Pace: careful and thorough. Give each step room; do not rush the build-up.");
  else if (ins.pace === "quick")
    out.push("Pace: answers quickly. Keep the pace up, but still show every step.");
  if (ins.unsureRate !== null && ins.unsureRate >= 0.25)
    out.push(
      'Confidence: often chooses "I\'m not sure yet". Be warm and encouraging; celebrate small wins.',
    );

  out.push(`Topic chosen: ${SKILL[target].title} (for example ${SKILL[target].example}).`);

  const path = topoOrder([...ancestors(target), target]);
  const levels = path.map((s) => {
    const prob = d.mastery[s];
    const n = d.attempts.filter((a) => a.skill === s).length;
    const word = STATE_WORDS[stateOf(prob, n)];
    const pct = prob === undefined ? "not tested" : `${Math.round(prob * 100)}%`;
    return `- ${SKILL[s].title} [${s}]: ${word} (${pct})`;
  });
  out.push(
    `How well they know the skills this topic rests on, foundations first:\n${levels.join("\n")}`,
  );
  if (needs.foundations.length)
    out.push(
      `Foundations to rebuild first, in this order: ${needs.foundations.map((s) => SKILL[s].title).join("; ")}.`,
    );

  if (needs.mistakes.length) {
    const lines = needs.mistakes.slice(0, 5).map(({ id, count }) => {
      const m = MISCONCEPTIONS[id];
      const ex = [...d.attempts].reverse().find((a) => a.misconception === id && a.question);
      const example = ex
        ? ` Their actual answer: to "${ex.question}" they chose "${ex.answer}".`
        : "";
      return `- [${id}] ${m.label}, seen ${count} time${count === 1 ? "" : "s"}. ${m.did}${example} The fix: ${m.fix}`;
    });
    out.push(`Mistakes they have made, most frequent first:\n${lines.join("\n")}`);
  } else {
    out.push("No specific mistakes recorded yet in this topic.");
  }
  return out.join("\n\n");
}

/** What the student has already watched in this series, so the next video builds on it. */
export function seriesSoFar(series: Series, upTo: number): string {
  return series.videos
    .slice(0, upTo)
    .map((v, i) => `Video ${i + 1}, "${v.video?.title ?? v.title}": ${v.goal}`)
    .join("\n");
}
