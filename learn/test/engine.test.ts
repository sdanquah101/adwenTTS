import { describe, expect, it } from "vitest";
import { bktUpdate, DEFAULT_BKT, KNOWN, MASTERED } from "../src/engine/bkt";
import { isFinished, MAX_QUESTIONS, recordAnswer, startDiagnostic } from "../src/engine/diagnostic";
import { needsFor } from "../src/engine/planner";
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
  it("puts unknown foundations first, in prerequisite order, and keeps the closest ones", () => {
    const needs = needsFor(
      "eq-both-sides",
      {
        "int-add": 0.2,
        "int-mul": 0.95,
        "eq-one-step": 0.9,
        "eq-two-step": 0.4,
        "like-terms": 0.3,
        "eq-both-sides": 0.2,
      },
      { "alg-combine-unlike": 2, "frac-flip": 3 },
    );
    expect(needs.foundations).toEqual(["int-add", "like-terms", "eq-two-step"]);
    // A fractions mistake is not on the way to this topic.
    expect(needs.mistakes.map((m) => m.id)).toEqual(["alg-combine-unlike"]);
  });
  it("has no foundations when everything underneath is known", () => {
    expect(needsFor("int-add", {}, {}).foundations).toEqual([]);
  });
});
