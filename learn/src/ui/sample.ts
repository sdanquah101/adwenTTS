import { makeItem } from "../content/generators";
import type { SkillId } from "../content/skills";
import { emptyData, type Attempt, type Data } from "../state";

/**
 * A realistic example student so a parent, teacher or funder can see the
 * profile and have a video series written without taking the diagnostic first.
 * Clearly marked as a sample in the interface.
 */
export function sampleStudent(): Data {
  const d = emptyData();
  const now = Date.now();
  d.profile = {
    name: "Abena",
    level: "JHS 3",
    accent: "purple",
    voice: "female",
    simpler: false,
    captions: true,
    speed: 1,
    interests: ["Football", "Buying and selling"],
    sample: true,
    createdAt: now - 3 * 864e5,
  };
  d.mastery = {
    "int-add": 0.93,
    "int-mul": 0.61,
    "like-terms": 0.38,
    expand: 0.3,
    "eq-one-step": 0.89,
    "eq-two-step": 0.56,
    "eq-both-sides": 0.18,
  };
  const script: [SkillId, boolean, number, Attempt["misconception"]?][] = [
    ["eq-both-sides", false, 41, "eq-move-no-sign-change"],
    ["eq-both-sides", false, 52, "eq-move-no-sign-change"],
    ["eq-two-step", true, 33],
    ["eq-two-step", false, 47, "eq-order-of-undoing"],
    ["eq-two-step", true, 29],
    ["like-terms", false, 26, "alg-combine-unlike"],
    ["like-terms", false, 31, "alg-combine-unlike"],
    ["eq-one-step", true, 18],
    ["eq-one-step", true, 15],
    ["int-add", true, 12],
    ["int-add", true, 14],
    ["int-mul", false, 22, "int-sign-rule"],
    ["int-mul", true, 19],
    ["int-mul", false, 24, "int-sign-rule"],
  ];
  d.attempts = script.map(([skill, correct, sec, m], i) => {
    const item = makeItem(skill, 1000 + i);
    // The option this mistake produces, when the generated question has one.
    const chosen = item.options.find((o) => (m ? o.misconception === m : o.correct === correct));
    return {
      t: now - 864e5 + i * 60e3,
      skill,
      item: item.id,
      correct,
      misconception: m,
      ms: sec * 1000,
      ctx: "diagnostic" as const,
      ...(chosen
        ? { question: item.math ? `${item.prompt} ${item.math}` : item.prompt, answer: chosen.text }
        : {}),
    };
  });
  for (const a of d.attempts)
    if (a.misconception)
      d.misconceptions[a.misconception] = (d.misconceptions[a.misconception] ?? 0) + 1;
  d.diagnosed = ["eq-both-sides"];
  d.planStart = { ...d.mastery };
  return d;
}
