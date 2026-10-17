import { MISCONCEPTIONS, type MisconceptionId } from "../content/misconceptions";
import { ancestors, SKILL, topoOrder, type SkillId } from "../content/skills";
import { KNOWN } from "./bkt";

export interface PlanStep {
  skill: SkillId;
  /** Main lesson, chosen by explanation style. */
  lesson: string;
  /** Short lessons aimed at mistakes this student has made in this skill. */
  fixes: string[];
  status: "todo" | "done" | "skipped";
}

export interface Plan {
  target: SkillId;
  steps: PlanStep[];
  /** Further skills still below "known" that did not fit in this session. */
  later: SkillId[];
  createdAt: number;
}

export const MAX_STEPS = 5;

export interface PlanInput {
  target: SkillId;
  mastery: Partial<Record<SkillId, number>>;
  /** Count of each mistake seen, from diagnostic and checks. */
  misconceptions: Partial<Record<MisconceptionId, number>>;
  /** Lesson ids available per skill, first is the default style. */
  lessonsFor: (skill: SkillId) => string[];
  /** Preferred style id when a skill has more than one lesson. */
  style?: string;
}

/**
 * Foundations first: every skill on the way to the target that is below
 * "known" gets a lesson, ordered so prerequisites come before what needs them.
 */
export function buildPlan(input: PlanInput): Plan {
  const { target, mastery } = input;
  const path = topoOrder([...ancestors(target), target]);
  const needed = path.filter((s) => (mastery[s] ?? 0) < KNOWN);
  // If the target already looks known, still give one lesson on it so the session has practice.
  if (needed.length === 0) needed.push(target);
  const steps: PlanStep[] = needed.slice(0, MAX_STEPS).map((skill) => {
    const lessons = input.lessonsFor(skill);
    const styled = input.style ? lessons.find((l) => l.endsWith(`-${input.style}`)) : undefined;
    return {
      skill,
      lesson: styled ?? lessons[0] ?? skill,
      fixes: fixesFor(skill, input.misconceptions),
      status: "todo",
    };
  });
  return { target, steps, later: needed.slice(MAX_STEPS), createdAt: Date.now() };
}

/** Remediation lessons for mistakes whose root is this skill, most frequent first. */
export function fixesFor(
  skill: SkillId,
  counts: Partial<Record<MisconceptionId, number>>,
): string[] {
  const out: string[] = [];
  const entries = Object.entries(counts) as [MisconceptionId, number][];
  entries.sort((a, b) => b[1] - a[1]);
  for (const [id, n] of entries) {
    const m = MISCONCEPTIONS[id];
    if (n > 0 && m.root === skill && m.lesson && !out.includes(m.lesson)) out.push(m.lesson);
  }
  return out.slice(0, 2);
}

/** Skills just above a mastered one that become reachable next. */
export function nextUp(mastery: Partial<Record<SkillId, number>>): SkillId[] {
  return (Object.keys(SKILL) as SkillId[]).filter(
    (s) => (mastery[s] ?? 0) < KNOWN && SKILL[s].prereqs.every((p) => (mastery[p] ?? 0) >= KNOWN),
  );
}
