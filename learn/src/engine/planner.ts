import { MISCONCEPTIONS, type MisconceptionId } from "../content/misconceptions";
import { ancestors, SKILL, topoOrder, type SkillId } from "../content/skills";
import { KNOWN } from "./bkt";

/** The most foundation skills one series goes back over before the topic itself. */
export const MAX_FOUNDATIONS = 3;

export interface Needs {
  target: SkillId;
  /** Skills below the topic that are not yet known, prerequisites first. */
  foundations: SkillId[];
  /** Further gaps that did not fit in this series. */
  later: SkillId[];
  /** Mistakes seen in this topic or under it, most frequent first. */
  mistakes: { id: MisconceptionId; count: number }[];
}

/**
 * Foundations first: every skill on the way to the topic that is below
 * "known", ordered so prerequisites come before what needs them. The topic
 * itself is always taught, even when it already looks known.
 */
export function needsFor(
  target: SkillId,
  mastery: Partial<Record<SkillId, number>>,
  misconceptions: Partial<Record<MisconceptionId, number>>,
): Needs {
  const below = topoOrder([...ancestors(target)]);
  const gaps = below.filter((s) => (mastery[s] ?? 0) < KNOWN);
  const onPath = new Set<SkillId>([...ancestors(target), target]);
  const mistakes = (Object.entries(misconceptions) as [MisconceptionId, number][])
    .filter(([id, n]) => n > 0 && onPath.has(MISCONCEPTIONS[id].root))
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }));
  // When there are too many gaps, keep the ones closest to the topic: the lowest
  // ones come back in a later series.
  const foundations = gaps.slice(-MAX_FOUNDATIONS);
  return { target, foundations, later: gaps.slice(0, -MAX_FOUNDATIONS), mistakes };
}

/** Skills just above a mastered one that become reachable next. */
export function nextUp(mastery: Partial<Record<SkillId, number>>): SkillId[] {
  return (Object.keys(SKILL) as SkillId[]).filter(
    (s) => (mastery[s] ?? 0) < KNOWN && SKILL[s].prereqs.every((p) => (mastery[p] ?? 0) >= KNOWN),
  );
}
