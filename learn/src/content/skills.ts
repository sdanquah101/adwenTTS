export type SkillId =
  | "int-add"
  | "int-mul"
  | "like-terms"
  | "expand"
  | "eq-one-step"
  | "eq-two-step"
  | "eq-both-sides"
  | "eq-brackets"
  | "eq-fractions"
  | "eq-word"
  | "frac-simplify"
  | "frac-add"
  | "frac-mul"
  | "frac-dec-pct"
  | "pct-of"
  | "pct-change";

export type Strand = "Number" | "Fractions and percentages" | "Algebra" | "Equations";

export interface Skill {
  id: SkillId;
  title: string;
  strand: Strand;
  /** One line a student recognises, shown on the topic card. */
  blurb: string;
  /** Example of the kind of question, shown on the card. */
  example: string;
  prereqs: SkillId[];
}

/**
 * The linear-equations strand of JHS mathematics and the skills it rests on.
 * Prerequisites point downwards: a gap in a prerequisite usually explains a
 * struggle higher up, so the diagnostic walks this graph from the top.
 */
export const SKILLS: Skill[] = [
  {
    id: "int-add",
    title: "Adding and subtracting negative numbers",
    strand: "Number",
    blurb: "Working with numbers below zero",
    example: "−7 + 3",
    prereqs: [],
  },
  {
    id: "int-mul",
    title: "Multiplying and dividing negative numbers",
    strand: "Number",
    blurb: "The sign rules for × and ÷",
    example: "(−3) × (−4)",
    prereqs: [],
  },
  {
    id: "like-terms",
    title: "Collecting like terms",
    strand: "Algebra",
    blurb: "Simplifying algebraic expressions",
    example: "3x + 5 + 2x − 1",
    prereqs: ["int-add"],
  },
  {
    id: "expand",
    title: "Expanding brackets",
    strand: "Algebra",
    blurb: "Multiplying out a bracket",
    example: "3(2x − 4)",
    prereqs: ["int-mul", "like-terms"],
  },
  {
    id: "eq-one-step",
    title: "One-step equations",
    strand: "Equations",
    blurb: "Finding x in one move",
    example: "x + 3 = 8",
    prereqs: ["int-add", "int-mul"],
  },
  {
    id: "eq-two-step",
    title: "Two-step equations",
    strand: "Equations",
    blurb: "Undoing two operations",
    example: "3x + 5 = 20",
    prereqs: ["eq-one-step"],
  },
  {
    id: "eq-both-sides",
    title: "Unknowns on both sides",
    strand: "Equations",
    blurb: "When x appears on both sides",
    example: "5x + 2 = 2x + 11",
    prereqs: ["eq-two-step", "like-terms"],
  },
  {
    id: "eq-brackets",
    title: "Equations with brackets",
    strand: "Equations",
    blurb: "Expanding, then solving",
    example: "3(x + 4) = 27",
    prereqs: ["eq-two-step", "expand"],
  },
  {
    id: "eq-fractions",
    title: "Equations with fractions",
    strand: "Equations",
    blurb: "Clearing the fraction first",
    example: "x/4 + 3 = 8",
    prereqs: ["eq-two-step"],
  },
  {
    id: "eq-word",
    title: "Word problems",
    strand: "Equations",
    blurb: "Turning a story into an equation",
    example: "Ama is 3 years older than Kojo…",
    prereqs: ["eq-two-step"],
  },
  {
    id: "frac-simplify",
    title: "Simplifying fractions",
    strand: "Fractions and percentages",
    blurb: "Equivalent fractions and simplest form",
    example: "18/24",
    prereqs: [],
  },
  {
    id: "frac-add",
    title: "Adding and subtracting fractions",
    strand: "Fractions and percentages",
    blurb: "Different denominators and mixed numbers",
    example: "2/3 + 1/4",
    prereqs: ["frac-simplify"],
  },
  {
    id: "frac-mul",
    title: "Multiplying and dividing fractions",
    strand: "Fractions and percentages",
    blurb: "Including “of”, and dividing by a fraction",
    example: "3/4 ÷ 1/2",
    prereqs: ["frac-simplify"],
  },
  {
    id: "frac-dec-pct",
    title: "Fractions, decimals and percentages",
    strand: "Fractions and percentages",
    blurb: "Changing from one form to another",
    example: "3/8 = ?%",
    prereqs: ["frac-simplify"],
  },
  {
    id: "pct-of",
    title: "Percentage of an amount",
    strand: "Fractions and percentages",
    blurb: "Finding a percentage of a quantity",
    example: "35% of GH₵80",
    prereqs: ["frac-mul", "frac-dec-pct"],
  },
  {
    id: "pct-change",
    title: "Percentage increase, decrease and profit",
    strand: "Fractions and percentages",
    blurb: "Discounts, price rises, profit and loss",
    example: "GH₵250 less 20%",
    prereqs: ["pct-of"],
  },
];

export const SKILL: Record<SkillId, Skill> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
) as Record<SkillId, Skill>;

/** All skills below `id`, nearest first is not guaranteed; use topoOrder to sort. */
export function ancestors(id: SkillId): Set<SkillId> {
  const out = new Set<SkillId>();
  const stack = [...SKILL[id].prereqs];
  while (stack.length) {
    const s = stack.pop() as SkillId;
    if (out.has(s)) continue;
    out.add(s);
    stack.push(...SKILL[s].prereqs);
  }
  return out;
}

/** Foundations first: every skill comes after all of its prerequisites. */
export function topoOrder(ids: Iterable<SkillId>): SkillId[] {
  const wanted = new Set(ids);
  return SKILLS.map((s) => s.id).filter((id) => wanted.has(id));
}
