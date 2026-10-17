import type { SkillId } from "./skills";

export type MisconceptionId =
  | "int-ignore-sign"
  | "int-sign-flip"
  | "int-add-sizes"
  | "int-minus-negative"
  | "int-sign-rule"
  | "int-wrong-operation"
  | "alg-combine-unlike"
  | "alg-sign-error"
  | "alg-add-powers"
  | "alg-partial-distribute"
  | "alg-add-instead"
  | "eq-same-operation"
  | "eq-wrong-inverse"
  | "eq-order-of-undoing"
  | "eq-sign-error"
  | "eq-divide-wrong-way"
  | "eq-move-no-sign-change"
  | "eq-ignore-term"
  | "eq-divide-not-multiply"
  | "eq-multiply-one-term"
  | "word-wrong-unknown"
  | "word-incomplete"
  | "word-ignored-difference";

export interface Misconception {
  id: MisconceptionId;
  /** Short name for teachers and parents. */
  label: string;
  /** What the student did, in plain words, second person. */
  did: string;
  /** The one-line fix. */
  fix: string;
  /** Skill where this mistake really lives (may be lower than where it showed up). */
  root: SkillId;
  /** Short lesson that targets this mistake, if one exists. */
  lesson?: string;
}

const M = (m: Misconception) => m;

export const MISCONCEPTIONS: Record<MisconceptionId, Misconception> = {
  "int-ignore-sign": M({
    id: "int-ignore-sign",
    label: "Ignores negative signs",
    did: "You worked with the numbers but ignored the negative signs.",
    fix: "Picture a number line: negative numbers sit to the left of zero.",
    root: "int-add",
  }),
  "int-sign-flip": M({
    id: "int-sign-flip",
    label: "Right size, wrong sign",
    did: "You got the right size of answer but the wrong sign.",
    fix: "After finding the size, decide whether the answer is left or right of zero.",
    root: "int-add",
  }),
  "int-add-sizes": M({
    id: "int-add-sizes",
    label: "Adds sizes when signs differ",
    did: "The signs were different, but you added the sizes.",
    fix: "Different signs: take the smaller size from the bigger, and keep the bigger one's sign.",
    root: "int-add",
  }),
  "int-minus-negative": M({
    id: "int-minus-negative",
    label: "Minus a negative treated as minus",
    did: "You treated “minus a negative” as a plain minus.",
    fix: "Minus a negative becomes plus: 5 − (−3) = 5 + 3 = 8.",
    root: "int-add",
    lesson: "fix-minus-negative",
  }),
  "int-sign-rule": M({
    id: "int-sign-rule",
    label: "Wrong sign rule for × and ÷",
    did: "You used the wrong sign rule for multiplying or dividing.",
    fix: "Same signs give a positive answer. Different signs give a negative answer.",
    root: "int-mul",
    lesson: "fix-sign-rule",
  }),
  "int-wrong-operation": M({
    id: "int-wrong-operation",
    label: "Uses the wrong operation",
    did: "You used a different operation from the one in the question.",
    fix: "Read the operation sign first: ×, ÷, + or −.",
    root: "int-mul",
  }),
  "alg-combine-unlike": M({
    id: "alg-combine-unlike",
    label: "Combines unlike terms",
    did: "You added the x terms and the plain numbers into one term.",
    fix: "x terms and plain numbers are different kinds. They stay separate.",
    root: "like-terms",
    lesson: "fix-unlike-terms",
  }),
  "alg-sign-error": M({
    id: "alg-sign-error",
    label: "Drops a minus sign",
    did: "A minus sign went missing along the way.",
    fix: "The sign in front of a term belongs to that term. Carry it with the term.",
    root: "like-terms",
  }),
  "alg-add-powers": M({
    id: "alg-add-powers",
    label: "Turns x + x into x²",
    did: "You turned adding x terms into x².",
    fix: "x + x = 2x. You only get x² from x × x.",
    root: "like-terms",
    lesson: "fix-unlike-terms",
  }),
  "alg-partial-distribute": M({
    id: "alg-partial-distribute",
    label: "Multiplies only the first term in a bracket",
    did: "You multiplied only the first term inside the bracket.",
    fix: "The number outside multiplies every term inside the bracket.",
    root: "expand",
    lesson: "fix-partial-distribute",
  }),
  "alg-add-instead": M({
    id: "alg-add-instead",
    label: "Adds the number outside a bracket",
    did: "You added the number outside the bracket instead of multiplying.",
    fix: "A number written next to a bracket means multiply.",
    root: "expand",
    lesson: "fix-partial-distribute",
  }),
  "eq-same-operation": M({
    id: "eq-same-operation",
    label: "Does the same operation, not the opposite",
    did: "You did the same operation again instead of the opposite one.",
    fix: "Undo + with −, − with +, × with ÷ and ÷ with ×.",
    root: "eq-one-step",
    lesson: "fix-opposite-operation",
  }),
  "eq-wrong-inverse": M({
    id: "eq-wrong-inverse",
    label: "Picks the wrong opposite operation",
    did: "You used the wrong opposite operation.",
    fix: "The opposite of × is ÷. The opposite of + is −.",
    root: "eq-one-step",
    lesson: "fix-opposite-operation",
  }),
  "eq-order-of-undoing": M({
    id: "eq-order-of-undoing",
    label: "Undoes in the wrong order",
    did: "You divided before removing the number that was added or subtracted.",
    fix: "Remove the added or subtracted number first, then divide.",
    root: "eq-two-step",
    lesson: "fix-undo-order",
  }),
  "eq-sign-error": M({
    id: "eq-sign-error",
    label: "Sign error when solving",
    did: "A sign changed when it should not have, or stayed when it should have changed.",
    fix: "Do exactly the same thing to both sides, and write every step.",
    root: "eq-two-step",
  }),
  "eq-divide-wrong-way": M({
    id: "eq-divide-wrong-way",
    label: "Divides the wrong way round",
    did: "You divided the wrong way round.",
    fix: "In 4x = 12, divide 12 by 4, not 4 by 12.",
    root: "eq-one-step",
  }),
  "eq-move-no-sign-change": M({
    id: "eq-move-no-sign-change",
    label: "Moves a term without changing its sign",
    did: "You moved a term across the equals sign without changing its sign.",
    fix: "Subtract it from both sides instead of moving it. Then the sign takes care of itself.",
    root: "eq-both-sides",
    lesson: "fix-move-sign",
  }),
  "eq-ignore-term": M({
    id: "eq-ignore-term",
    label: "Leaves out a term",
    did: "One of the terms got left out.",
    fix: "Every term has to be dealt with before you divide.",
    root: "eq-two-step",
  }),
  "eq-divide-not-multiply": M({
    id: "eq-divide-not-multiply",
    label: "Divides when it should multiply",
    did: "You divided when you needed to multiply.",
    fix: "x ÷ 4 is undone by × 4.",
    root: "eq-fractions",
    lesson: "fix-clear-fraction",
  }),
  "eq-multiply-one-term": M({
    id: "eq-multiply-one-term",
    label: "Multiplies only part of the equation",
    did: "You multiplied only part of the equation.",
    fix: "When you multiply, multiply every term on both sides.",
    root: "eq-fractions",
    lesson: "fix-clear-fraction",
  }),
  "word-wrong-unknown": M({
    id: "word-wrong-unknown",
    label: "Answers for the wrong quantity",
    did: "You found the other person’s value instead of the one the question asked for.",
    fix: "Read the last line again: who or what is the question asking about?",
    root: "eq-word",
    lesson: "fix-answer-the-question",
  }),
  "word-incomplete": M({
    id: "word-incomplete",
    label: "Stops one step early",
    did: "You stopped one step before the end.",
    fix: "Check that your answer is the quantity the question asks for.",
    root: "eq-word",
    lesson: "fix-answer-the-question",
  }),
  "word-ignored-difference": M({
    id: "word-ignored-difference",
    label: "Leaves out information",
    did: "You left out one piece of information from the question.",
    fix: "Every number in the question is there for a reason. Use them all.",
    root: "eq-word",
  }),
};
