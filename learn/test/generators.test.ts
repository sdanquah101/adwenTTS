import { describe, expect, it } from "vitest";
import { makeItem, type Check } from "../src/content/generators";
import { MISCONCEPTIONS } from "../src/content/misconceptions";
import { SKILLS } from "../src/content/skills";
import { Q } from "../src/math/q";

/** Recompute the right answer from the question's structure, independently of the generator. */
function expectedKey(check: Check): string {
  switch (check.kind) {
    case "arith": {
      const { op, a, b } = check;
      const v =
        op === "+"
          ? new Q(a + b)
          : op === "-"
            ? new Q(a - b)
            : op === "*"
              ? new Q(a * b)
              : new Q(a, b);
      return v.key();
    }
    case "collect": {
      const A = check.terms.filter((t) => t.x).reduce((s, t) => s + t.coef, 0);
      const B = check.terms.filter((t) => !t.x).reduce((s, t) => s + t.coef, 0);
      return `e:${A}:${B}:1`;
    }
    case "expand":
      return `e:${check.k * check.a}:${check.k * check.b}:1`;
    case "equation": {
      const [l0, l1] = check.left;
      const [r0, r1] = check.right;
      const x = r1.sub(l1).div(l0.sub(r0));
      // substitute back: both sides must agree
      expect(l0.mul(x).add(l1).eq(r0.mul(x).add(r1))).toBe(true);
      return x.key();
    }
  }
}

const SEEDS = 500;

describe.each(SKILLS.map((s) => s.id))("generator %s", (skill) => {
  it(`produces ${SEEDS} valid questions`, () => {
    const misconceptionsSeen = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const item = makeItem(skill, seed);
      expect(item.options).toHaveLength(4);
      expect(item.options.map((o) => o.letter)).toEqual(["A", "B", "C", "D"]);
      const correct = item.options.filter((o) => o.correct);
      expect(correct, `${item.id} must have exactly one correct option`).toHaveLength(1);
      expect(new Set(item.options.map((o) => o.key)).size, `${item.id} options must differ`).toBe(
        4,
      );
      expect(
        new Set(item.options.map((o) => o.text)).size,
        `${item.id} option texts must differ`,
      ).toBe(4);
      expect(correct[0]!.key, `${item.id} correct answer`).toBe(expectedKey(item.check));
      expect(correct[0]!.misconception).toBeUndefined();
      for (const o of item.options) {
        expect(o.text).not.toMatch(/NaN|undefined|Infinity/);
        if (o.misconception) {
          expect(MISCONCEPTIONS[o.misconception]).toBeDefined();
          misconceptionsSeen.add(o.misconception);
        }
      }
      expect(`${item.prompt} ${item.math ?? ""}`).not.toMatch(/NaN|undefined|\+ -|- -/);
      expect(item.solution.length).toBeGreaterThan(0);
      if (item.check.kind === "equation") {
        // BECE-style: solutions to the equations we pose are whole numbers
        expect(correct[0]!.key).toMatch(/^-?\d+$/);
      }
      // same seed, same question
      expect(makeItem(skill, seed)).toEqual(item);
    }
    expect(
      misconceptionsSeen.size,
      "distractors should carry diagnosable mistakes",
    ).toBeGreaterThan(0);
  });
});

describe("word problems", () => {
  it("always have positive answers", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const item = makeItem("eq-word", seed);
      const key = item.options.find((o) => o.correct)!.key;
      expect(Number(key)).toBeGreaterThan(0);
    }
  });
});
