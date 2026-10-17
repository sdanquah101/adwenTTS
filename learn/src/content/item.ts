import { Rng } from "../engine/rng";
import { fmtQ, linear } from "../math/format";
import { Q, q } from "../math/q";
import type { MisconceptionId } from "./misconceptions";
import type { SkillId } from "./skills";

export type Letter = "A" | "B" | "C" | "D";

export interface Option {
  letter: Letter;
  text: string;
  /** Canonical value: "7", "-7/3", or "e:5:4:1" for 5x + 4. */
  key: string;
  correct: boolean;
  /** The mistake that produces this wrong answer, when we know it. */
  misconception?: MisconceptionId;
}

/** Enough structure for an independent check of the correct answer (see tests). */
export type Check =
  | { kind: "arith"; op: "+" | "-" | "*" | "/"; a: number; b: number }
  | { kind: "collect"; terms: { coef: number; x: boolean }[] }
  | { kind: "expand"; k: number; a: number; b: number }
  | { kind: "equation"; left: [Q, Q]; right: [Q, Q] }
  | { kind: "simplify"; n: number; d: number }
  | { kind: "missing"; p: number; q: number; D: number }
  | { kind: "frac-op"; op: "+" | "-" | "*" | "/"; a: [number, number]; b: [number, number] }
  | { kind: "convert"; to: "pct" | "frac"; value: Q }
  | { kind: "pct-of"; p: number; amount: number }
  | { kind: "pct-new"; P: number; r: number }
  | { kind: "pct-change"; P: number; N: number };

export interface Item {
  id: string;
  skill: SkillId;
  seed: number;
  prompt: string;
  /** The expression or equation, shown large. Absent for word problems. */
  math?: string;
  options: Option[];
  /** Worked solution, one step per line. */
  solution: string[];
  check: Check;
}

export interface Cand {
  text: string;
  key: string;
  misconception?: MisconceptionId;
}

export interface Unit {
  pre?: string;
  post?: string;
}

export function num(v: Q | number, m?: MisconceptionId, unit: Unit = {}): Cand {
  return {
    text: `${unit.pre ?? ""}${fmtQ(v)}${unit.post ?? ""}`,
    key: q(v).key(),
    misconception: m,
  };
}

export function expr(a: number, b: number, m?: MisconceptionId, power = 1): Cand {
  return { text: linear(a, b, "x", power), key: `e:${a}:${b}:${power}`, misconception: m };
}

export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export function assemble(
  rng: Rng,
  correct: Cand,
  distractors: Cand[],
  filler: (i: number) => Cand | null,
): Option[] {
  const picked: Cand[] = [correct];
  const seen = new Set([correct.key]);
  for (const d of distractors) {
    if (picked.length >= 4) break;
    if (!seen.has(d.key)) {
      seen.add(d.key);
      picked.push(d);
    }
  }
  for (let i = 1; picked.length < 4; i++) {
    if (i > 60) throw new Error("could not fill options");
    const f = filler(i);
    if (f && !seen.has(f.key)) {
      seen.add(f.key);
      picked.push(f);
    }
  }
  return rng.shuffle(picked).map((c, i) => ({
    letter: LETTERS[i] as Letter,
    text: c.text,
    key: c.key,
    correct: c.key === correct.key,
    misconception: c.key === correct.key ? undefined : c.misconception,
  }));
}

/** Near misses around the answer: +1, −1, +2, −2 … */
export function near(value: number, unit: Unit = {}, positiveOnly = false) {
  return (i: number): Cand | null => {
    const step = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    const v = value + step;
    if (positiveOnly && v <= 0) return null;
    return num(v, undefined, unit);
  };
}

export type Gen = (rng: Rng) => Omit<Item, "id" | "skill" | "seed">;
