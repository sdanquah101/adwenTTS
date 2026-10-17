import { describe, expect, it } from "vitest";
import { bktUpdate, DEFAULT_BKT, KNOWN, MASTERED } from "../src/engine/bkt";
import { isFinished, MAX_QUESTIONS, recordAnswer, startDiagnostic } from "../src/engine/diagnostic";
import { buildPlan, fixesFor } from "../src/engine/planner";
import { ancestors, SKILLS, topoOrder, type SkillId } from "../src/content/skills";

describe("skill graph", () => {
  it("has no cycles and orders prerequisites first", () => {
    for (const s of SKILLS) {
      expect(ancestors(s.id).has(s.id)).toBe(false);
      const order = topoOrder([...ancestors(s.id), s.id]);
      expect(order.at(-1)).toBe(s.id);
      for (const id of order) {
        for (const pre of SKILLS.find((x) => x.id === id)!.prereqs) {
          expect(order.indexOf(pre)).toBeLessThan(order.indexOf(id));
        }
      }
    }
  });
});

describe("knowledge tracing", () => {
  it("two right answers from the prior reach 'known', three reach 'mastered'", () => {
    let p = DEFAULT_BKT.init;
    p = bktUpdate(p, true, false);
    p = bktUpdate(p, true, false);
    expect(p).toBeGreaterThanOrEqual(KNOWN);
    p = bktUpdate(p, true, false);
    expect(p).toBeGreaterThanOrEqual(MASTERED);
  });
  it("wrong answers lower the estimate and practice nudges it up", () => {
    const p = 0.6;
    expect(bktUpdate(p, false, false)).toBeLessThan(p);
    expect(bktUpdate(p, false, true)).toBeGreaterThan(bktUpdate(p, false, false));
  });
});

/** Simulated student who knows exactly the given skills. */
function run(target: SkillId, known: Set<SkillId>) {
  let s = startDiagnostic(target);
  let guard = 0;
  while (!isFinished(s) && guard++ < 50)
    s = recordAnswer(s, { skill: s.current!, correct: known.has(s.current!) });
  return s;
}

describe("adaptive diagnostic", () => {
  it("stops after two right answers when the target is known", () => {
    const s = run("eq-both-sides", new Set(SKILLS.map((x) => x.id)));
    expect(s.asked).toBe(2);
    expect(s.results["eq-both-sides"]?.passed).toBe(true);
  });

  it("walks down to the real gap", () => {
    // Knows everything except negative-number addition.
    const known = new Set(SKILLS.map((x) => x.id).filter((id) => id !== "int-add"));
    known.delete("eq-both-sides");
    known.delete("like-terms");
    const s = run("eq-both-sides", known);
    expect(s.results["int-add"]?.passed).toBe(false);
    expect(s.results["eq-two-step"]?.passed).toBe(true);
    expect(s.asked).toBeLessThanOrEqual(MAX_QUESTIONS);
  });

  it("never exceeds the question limit", () => {
    const s = run("eq-brackets", new Set());
    expect(s.asked).toBeLessThanOrEqual(MAX_QUESTIONS);
  });
});

describe("planner", () => {
  const lessonsFor = (s: SkillId) => [`${s}-a`, `${s}-b`];
  it("puts foundations first and skips known skills", () => {
    const plan = buildPlan({
      target: "eq-both-sides",
      mastery: {
        "int-add": 0.2,
        "int-mul": 0.95,
        "eq-one-step": 0.9,
        "eq-two-step": 0.4,
        "like-terms": 0.3,
        "eq-both-sides": 0.2,
      },
      misconceptions: {},
      lessonsFor,
    });
    expect(plan.steps.map((s) => s.skill)).toEqual([
      "int-add",
      "like-terms",
      "eq-two-step",
      "eq-both-sides",
    ]);
  });
  it("uses the preferred style when a lesson exists for it", () => {
    const plan = buildPlan({
      target: "eq-two-step",
      mastery: {},
      misconceptions: {},
      lessonsFor,
      style: "b",
    });
    expect(plan.steps.every((s) => s.lesson.endsWith("-b"))).toBe(true);
  });
  it("attaches fixes for mistakes rooted in a skill", () => {
    expect(fixesFor("int-add", { "int-minus-negative": 2, "eq-sign-error": 5 })).toEqual([
      "fix-minus-negative",
    ]);
  });
});

import { LESSONS, lessonsFor } from "../src/content/lessons";
import { MISCONCEPTIONS } from "../src/content/misconceptions";

describe("lessons", () => {
  it("every skill has a main lesson and every remediation link resolves", () => {
    for (const s of SKILLS) expect(lessonsFor(s.id).length).toBeGreaterThan(0);
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const m of Object.values(MISCONCEPTIONS))
      if (m.lesson) expect(ids.has(m.lesson), m.lesson).toBe(true);
  });
  it("balance scenes stay balanced through every action", () => {
    for (const l of LESSONS)
      for (const sc of l.scenes) {
        if (sc.type !== "balance") continue;
        let L = { x: sc.left.x ?? 0, u: sc.left.units ?? 0 };
        let R = { x: sc.right.x ?? 0, u: sc.right.units ?? 0 };
        for (const a of sc.actions) {
          if (a.type === "removeUnits") {
            L.u -= a.n;
            R.u -= a.n;
          }
          if (a.type === "removeX") {
            L.x -= a.n;
            R.x -= a.n;
          }
          if (a.type === "share") {
            expect((L.x % a.groups) + (L.u % a.groups) + (R.x % a.groups) + (R.u % a.groups)).toBe(
              0,
            );
            L = { x: L.x / a.groups, u: L.u / a.groups };
            R = { x: R.x / a.groups, u: R.u / a.groups };
          }
          expect(Math.min(L.x, L.u, R.x, R.u)).toBeGreaterThanOrEqual(0);
        }
        expect(`x = ${R.u}`).toBe(sc.result);
        expect(L.x).toBe(1);
      }
  });
});
