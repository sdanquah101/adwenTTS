/**
 * Bayesian Knowledge Tracing: one probability per skill that the student has
 * learned it, updated after every answer. Parameters are standard starting
 * values; they should be re-fitted once real student data exists.
 */
export interface BktParams {
  init: number;
  learn: number;
  slip: number;
  guess: number;
}

export const DEFAULT_BKT: BktParams = { init: 0.35, learn: 0.12, slip: 0.1, guess: 0.25 };

/** A skill counts as known (skip its lesson) at or above this. */
export const KNOWN = 0.85;
/** A skill counts as mastered at or above this. */
export const MASTERED = 0.9;

/**
 * Update P(learned) after one answer. `practice` adds the chance of learning
 * from the attempt itself; it is off during the diagnostic, where nothing is taught.
 */
export function bktUpdate(
  p: number,
  correct: boolean,
  practice: boolean,
  prm: BktParams = DEFAULT_BKT,
): number {
  const { slip, guess, learn } = prm;
  const post = correct
    ? (p * (1 - slip)) / (p * (1 - slip) + (1 - p) * guess)
    : (p * slip) / (p * slip + (1 - p) * (1 - guess));
  const next = practice ? post + (1 - post) * learn : post;
  return Math.min(0.999, Math.max(0.001, next));
}

export type SkillState = "mastered" | "known" | "learning" | "gap" | "untested";

export function stateOf(p: number | undefined, attempts: number): SkillState {
  if (p === undefined || (attempts === 0 && p === DEFAULT_BKT.init)) return "untested";
  if (p >= MASTERED) return "mastered";
  if (p >= KNOWN) return "known";
  if (p >= 0.5) return "learning";
  return "gap";
}
