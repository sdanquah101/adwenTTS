import type { SkillId } from "./skills";

/** Narration: `text` is the standard script, `simple` uses shorter sentences and easier words. */
export interface Say {
  text: string;
  simple?: string;
}

export interface Pan {
  x?: number;
  units?: number;
}

export type BalanceAction =
  | { type: "removeUnits"; n: number; label: string }
  | { type: "removeX"; n: number; label: string }
  | { type: "share"; groups: number; label: string };

export interface Tile {
  kind: "x" | "1";
  /** Negative for negative tiles. */
  n: number;
}

export type Scene =
  | { type: "intro"; kicker: string; title: string; say: Say }
  | { type: "steps"; lines: { expr: string; note?: string }[]; say: Say }
  | {
      type: "balance";
      math: string;
      left: Pan;
      right: Pan;
      actions: BalanceAction[];
      result: string;
      say: Say;
    }
  | {
      type: "numberline";
      math: string;
      start: number;
      by: number;
      min: number;
      max: number;
      say: Say;
    }
  | { type: "tiles"; math: string; tiles: Tile[]; result: string; say: Say }
  | { type: "contrast"; wrong: string; right: string; why: string; say: Say }
  | { type: "rule"; title: string; body: string[]; say: Say };

export type Style = "visual" | "balance" | "undo" | "fix";

export interface Lesson {
  id: string;
  skill: SkillId;
  title: string;
  style: Style;
  scenes: Scene[];
}

const L = (l: Lesson) => l;
const M = "−";

export const LESSONS: Lesson[] = [
  L({
    id: "int-add-visual",
    skill: "int-add",
    title: "Negative numbers on the number line",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Number",
        title: "Adding and subtracting negative numbers",
        say: {
          text: "Negative numbers can feel tricky. A number line makes them easy. Let's see how.",
          simple: "Negative numbers can be hard. A number line helps. Let's look.",
        },
      },
      {
        type: "numberline",
        math: `${M}7 + 3`,
        start: -7,
        by: 3,
        min: -10,
        max: 4,
        say: {
          text: "Start at negative seven. Adding three means moving three steps to the right. We land on negative four.",
          simple:
            "Start at negative seven. Add three: move three steps right. We land on negative four.",
        },
      },
      {
        type: "numberline",
        math: `2 ${M} 5`,
        start: 2,
        by: -5,
        min: -6,
        max: 6,
        say: {
          text: "Start at two. Subtracting five means moving five steps to the left. We pass zero and land on negative three.",
          simple:
            "Start at two. Take away five: move five steps left. We go past zero to negative three.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: `6 ${M} (${M}2)` },
          { expr: "6 + 2", note: "minus a negative is plus" },
          { expr: "8" },
        ],
        say: {
          text: "Here is the special one. Taking away a negative is the same as adding. Six minus negative two is six plus two, which is eight.",
          simple:
            "This one is special. Minus a negative means plus. Six minus negative two is six plus two. That is eight.",
        },
      },
      {
        type: "numberline",
        math: `${M}3 ${M} 4`,
        start: -3,
        by: -4,
        min: -9,
        max: 2,
        say: {
          text: "Negative three minus four. Start at negative three and move four more steps to the left. Negative seven.",
          simple:
            "Negative three minus four. Start at negative three. Move four steps left. Negative seven.",
        },
      },
      {
        type: "rule",
        title: "Remember",
        body: ["Adding: move right.", "Subtracting: move left.", "Minus a negative becomes plus."],
        say: {
          text: "Remember. Adding moves you right. Subtracting moves you left. And minus a negative becomes plus. Now try some.",
        },
      },
    ],
  }),
  L({
    id: "int-mul-visual",
    skill: "int-mul",
    title: "The sign rules",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Number",
        title: "Multiplying and dividing negative numbers",
        say: {
          text: "When you multiply or divide negative numbers, work with the numbers first, then decide the sign.",
          simple: "First work out the number. Then choose the sign.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "3 × 4 = 12" },
          { expr: `(${M}3) × 4 = ${M}12`, note: "one negative" },
          { expr: `3 × (${M}4) = ${M}12`, note: "one negative" },
          { expr: `(${M}3) × (${M}4) = 12`, note: "two negatives" },
        ],
        say: {
          text: "Three times four is twelve. If one of the numbers is negative, the answer is negative. If both are negative, the answer is positive.",
          simple:
            "Three times four is twelve. One negative: the answer is negative. Two negatives: the answer is positive.",
        },
      },
      {
        type: "rule",
        title: "The sign rule",
        body: ["Same signs give +", "Different signs give −"],
        say: {
          text: "So the rule is short. Same signs give a positive answer. Different signs give a negative answer.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: `${M}20 ÷ 5` },
          { expr: "20 ÷ 5 = 4", note: "number first" },
          { expr: `${M}4`, note: "signs differ" },
        ],
        say: {
          text: "Division follows the same rule. Negative twenty divided by five. Twenty divided by five is four. The signs are different, so the answer is negative four.",
          simple:
            "Division uses the same rule. Twenty divided by five is four. The signs are different. So the answer is negative four.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: `${M}18 ÷ (${M}6)` },
          { expr: "18 ÷ 6 = 3", note: "number first" },
          { expr: "3", note: "signs the same" },
        ],
        say: {
          text: "Negative eighteen divided by negative six. Eighteen divided by six is three. The signs are the same, so the answer is positive three.",
          simple:
            "Eighteen divided by six is three. The signs are the same. So the answer is positive three.",
        },
      },
      {
        type: "rule",
        title: "Two steps every time",
        body: ["1. Work out the number.", "2. Use the sign rule."],
        say: { text: "Two steps every time. Work out the number, then use the sign rule." },
      },
    ],
  }),
  L({
    id: "like-terms-visual",
    skill: "like-terms",
    title: "Like terms belong together",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Algebra",
        title: "Collecting like terms",
        say: {
          text: "In algebra, we tidy up an expression by putting similar things together. These are called like terms.",
          simple:
            "We tidy an expression by putting the same kinds together. We call them like terms.",
        },
      },
      {
        type: "tiles",
        math: `3x + 5 + 2x ${M} 1`,
        tiles: [
          { kind: "x", n: 3 },
          { kind: "1", n: 5 },
          { kind: "x", n: 2 },
          { kind: "1", n: -1 },
        ],
        result: "5x + 4",
        say: {
          text: "Look at three x plus five plus two x minus one. Put the x terms together: three x plus two x is five x. Put the numbers together: five minus one is four. The answer is five x plus four.",
          simple:
            "Three x and two x make five x. Five and minus one make four. The answer is five x plus four.",
        },
      },
      {
        type: "contrast",
        wrong: `3x + 5 + 2x ${M} 1 = 9x`,
        right: `3x + 5 + 2x ${M} 1 = 5x + 4`,
        why: "x terms and plain numbers are different kinds. They stay separate.",
        say: {
          text: "A common mistake is to add everything and write nine x. But x terms and numbers are different kinds of things, like oranges and mangoes. They stay separate.",
          simple:
            "Do not add everything to get nine x. x terms and numbers are different, like oranges and mangoes. Keep them apart.",
        },
      },
      {
        type: "contrast",
        wrong: "2x + 3x = 5x²",
        right: "2x + 3x = 5x",
        why: "Adding x terms keeps x. Only x × x gives x².",
        say: {
          text: "Another trap. Two x plus three x is five x, not five x squared. We only get x squared when we multiply x by x.",
          simple:
            "Two x plus three x is five x. It is not five x squared. x squared comes from x times x.",
        },
      },
      {
        type: "rule",
        title: "Watch the signs",
        body: ["The sign in front belongs to the term.", `7x ${M} 2x = 5x`],
        say: {
          text: "Finally, the sign in front of a term belongs to that term. Seven x minus two x is five x.",
          simple: "The sign in front goes with the term. Seven x minus two x is five x.",
        },
      },
    ],
  }),
  L({
    id: "expand-visual",
    skill: "expand",
    title: "Multiply everything inside",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Algebra",
        title: "Expanding brackets",
        say: {
          text: "A number outside a bracket multiplies everything inside the bracket.",
          simple: "The number outside a bracket multiplies every term inside.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "3(2x + 4)" },
          { expr: "3 × 2x + 3 × 4", note: "multiply each term" },
          { expr: "6x + 12" },
        ],
        say: {
          text: "Three, bracket, two x plus four. Multiply three by two x to get six x. Multiply three by four to get twelve. So we get six x plus twelve.",
          simple:
            "Three times two x is six x. Three times four is twelve. So we get six x plus twelve.",
        },
      },
      {
        type: "contrast",
        wrong: "3(2x + 4) = 6x + 4",
        right: "3(2x + 4) = 6x + 12",
        why: "The 3 multiplies the 4 as well.",
        say: {
          text: "Do not stop after the first term. The three multiplies the four as well.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: `${M}2(x ${M} 5)` },
          { expr: `(${M}2) × x + (${M}2) × (${M}5)`, note: "signs go too" },
          { expr: `${M}2x + 10` },
        ],
        say: {
          text: "Now with negatives. Negative two times x is negative two x. Negative two times negative five is positive ten, because same signs give a positive. So we get negative two x plus ten.",
          simple:
            "Negative two times x is negative two x. Negative two times negative five is ten. So we get negative two x plus ten.",
        },
      },
      {
        type: "rule",
        title: "Every term, with its sign",
        body: ["Multiply each term inside the bracket.", "Take its sign with it."],
        say: {
          text: "Remember. Multiply every term inside the bracket, and take its sign with it.",
        },
      },
    ],
  }),
  L({
    id: "eq-one-step-balance",
    skill: "eq-one-step",
    title: "Keep the scale balanced",
    style: "balance",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Solving one-step equations",
        say: {
          text: "An equation is like a balanced scale. Both sides weigh the same.",
          simple: "An equation is like a scale. Both sides are equal.",
        },
      },
      {
        type: "balance",
        math: "x + 3 = 8",
        left: { x: 1, units: 3 },
        right: { units: 8 },
        actions: [{ type: "removeUnits", n: 3, label: `${M} 3 from both sides` }],
        result: "x = 5",
        say: {
          text: "x plus three equals eight. To find x, take three away from both sides. The scale stays balanced, and x equals five.",
          simple: "x plus three equals eight. Take three from both sides. Now x equals five.",
        },
      },
      {
        type: "balance",
        math: "4x = 12",
        left: { x: 4 },
        right: { units: 12 },
        actions: [{ type: "share", groups: 4, label: "÷ 4 both sides" }],
        result: "x = 3",
        say: {
          text: "Four x equals twelve. Share both sides into four equal groups. One x balances three. So x equals three.",
          simple: "Four x equals twelve. Make four equal groups on each side. One x is three.",
        },
      },
      {
        type: "rule",
        title: "Do the opposite",
        body: ["+ is undone by −", "× is undone by ÷", "Do it to both sides."],
        say: {
          text: "To solve, do the opposite. Adding is undone by subtracting. Multiplying is undone by dividing. Always do it to both sides.",
          simple:
            "Do the opposite. Plus is undone by minus. Times is undone by divide. Do it to both sides.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "x/5 = 4" },
          { expr: "x = 4 × 5", note: "× 5 both sides" },
          { expr: "x = 20" },
        ],
        say: {
          text: "x divided by five equals four. Division is undone by multiplying. Multiply both sides by five, and x equals twenty.",
          simple: "x divided by five equals four. Multiply both sides by five. x equals twenty.",
        },
      },
    ],
  }),
  L({
    id: "eq-two-step-balance",
    skill: "eq-two-step",
    title: "Two steps on the scale",
    style: "balance",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Solving two-step equations",
        say: {
          text: "Some equations need two steps. We undo them one at a time, keeping the scale balanced.",
          simple: "Some equations need two steps. We do one step at a time.",
        },
      },
      {
        type: "balance",
        math: "3x + 5 = 20",
        left: { x: 3, units: 5 },
        right: { units: 20 },
        actions: [
          { type: "removeUnits", n: 5, label: `${M} 5 from both sides` },
          { type: "share", groups: 3, label: "÷ 3 both sides" },
        ],
        result: "x = 5",
        say: {
          text: "Three x plus five equals twenty. First take five from both sides. Now three x equals fifteen. Then share both sides into three groups. x equals five.",
          simple:
            "Take five from both sides. Three x equals fifteen. Make three groups. x equals five.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "3x + 5 = 20" },
          { expr: "3x = 15", note: `${M} 5 both sides` },
          { expr: "x = 5", note: "÷ 3 both sides" },
        ],
        say: {
          text: "Written down: subtract five from both sides to get three x equals fifteen. Divide both sides by three to get x equals five.",
          simple:
            "Minus five on both sides: three x equals fifteen. Divide by three: x equals five.",
        },
      },
      {
        type: "steps",
        lines: [{ expr: "Check: 3 × 5 + 5" }, { expr: "= 15 + 5 = 20", note: "it matches" }],
        say: {
          text: "Always check. Three times five plus five is twenty. It matches, so x equals five is correct.",
          simple: "Check it. Three times five plus five is twenty. Correct.",
        },
      },
      {
        type: "rule",
        title: "Undo in reverse order",
        body: [
          "1. Remove the number added or subtracted.",
          "2. Divide by the number in front of x.",
        ],
        say: {
          text: "Undo in reverse order. First remove the number that is added or subtracted. Then divide by the number in front of x.",
        },
      },
    ],
  }),
  L({
    id: "eq-two-step-undo",
    skill: "eq-two-step",
    title: "Run the machine backwards",
    style: "undo",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Two-step equations: run it backwards",
        say: {
          text: "Think of an equation as a machine. We find x by running the machine backwards.",
          simple: "An equation is like a machine. We run it backwards to find x.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "x → × 3 → + 5 → 20", note: "the machine" },
          { expr: `20 → ${M} 5 → ÷ 3 → x`, note: "backwards" },
          { expr: "20 − 5 = 15,  15 ÷ 3 = 5" },
        ],
        say: {
          text: "Three x plus five equals twenty means: start with x, multiply by three, add five, and get twenty. Run it backwards. Take away five to get fifteen, then divide by three. x is five.",
          simple:
            "x goes in. Times three. Plus five. Twenty comes out. Backwards: twenty minus five is fifteen. Fifteen divided by three is five.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: `4x ${M} 7 = 21` },
          { expr: "4x = 28", note: "+ 7 both sides" },
          { expr: "x = 7", note: "÷ 4 both sides" },
        ],
        say: {
          text: "Another one. Four x minus seven equals twenty-one. Undo the minus seven by adding seven: four x equals twenty-eight. Undo times four by dividing: x equals seven.",
          simple:
            "Four x minus seven equals twenty-one. Add seven: four x equals twenty-eight. Divide by four: x equals seven.",
        },
      },
      {
        type: "contrast",
        wrong: `3x + 5 = 20  →  x = 20 ÷ 3 ${M} 5`,
        right: `3x + 5 = 20  →  x = (20 ${M} 5) ÷ 3 = 5`,
        why: "Undo the + 5 first. Dividing first leaves the 5 undivided.",
        say: {
          text: "A common mistake is dividing first. Undo the plus five first, then divide.",
        },
      },
      {
        type: "rule",
        title: "Backwards and opposite",
        body: ["Undo the last step first.", "Use the opposite operation each time."],
        say: { text: "Work backwards, and use the opposite operation each time." },
      },
    ],
  }),
  L({
    id: "eq-both-sides-balance",
    skill: "eq-both-sides",
    title: "x on both sides",
    style: "balance",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Unknowns on both sides",
        say: {
          text: "Sometimes x appears on both sides. The plan is to gather the x terms on one side and the numbers on the other.",
          simple:
            "Sometimes x is on both sides. Put the x terms on one side and the numbers on the other.",
        },
      },
      {
        type: "balance",
        math: "5x + 2 = 2x + 11",
        left: { x: 5, units: 2 },
        right: { x: 2, units: 11 },
        actions: [
          { type: "removeX", n: 2, label: `${M} 2x from both sides` },
          { type: "removeUnits", n: 2, label: `${M} 2 from both sides` },
          { type: "share", groups: 3, label: "÷ 3 both sides" },
        ],
        result: "x = 3",
        say: {
          text: "Five x plus two equals two x plus eleven. Take two x from both sides: three x plus two equals eleven. Take two from both sides: three x equals nine. Share into three groups: x equals three.",
          simple:
            "Take two x from both sides. Then take two from both sides. Three x equals nine. So x equals three.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "5x + 2 = 2x + 11" },
          { expr: "3x + 2 = 11", note: `${M} 2x both sides` },
          { expr: "3x = 9", note: `${M} 2 both sides` },
          { expr: "x = 3", note: "÷ 3 both sides" },
        ],
        say: {
          text: "Here are the same steps in writing.",
          simple: "Here are the steps written down.",
        },
      },
      {
        type: "contrast",
        wrong: "5x + 2 = 2x + 11  →  7x = 9",
        right: "5x + 2 = 2x + 11  →  3x = 9",
        why: "Subtract 2x from both sides. Moving it without changing its sign gives 7x.",
        say: {
          text: "Watch out. We subtract two x from both sides. We do not add it. If you move a term across the equals sign, its sign must change.",
          simple: "Be careful. We take away two x. We do not add it.",
        },
      },
      {
        type: "rule",
        title: "x to one side, numbers to the other",
        body: ["Whatever you do, do it to both sides."],
        say: {
          text: "x terms to one side, numbers to the other, and whatever you do, do it to both sides.",
        },
      },
    ],
  }),
  L({
    id: "eq-brackets-visual",
    skill: "eq-brackets",
    title: "Expand, then solve",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Equations with brackets",
        say: {
          text: "If an equation has a bracket, expand it first. Then solve as usual.",
          simple: "If there is a bracket, multiply it out first. Then solve.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "3(x + 4) = 27" },
          { expr: "3x + 12 = 27", note: "expand" },
          { expr: "3x = 15", note: `${M} 12 both sides` },
          { expr: "x = 5", note: "÷ 3 both sides" },
        ],
        say: {
          text: "Three, bracket, x plus four, equals twenty-seven. Expand: three x plus twelve equals twenty-seven. Subtract twelve: three x equals fifteen. Divide by three: x equals five.",
          simple:
            "Multiply out: three x plus twelve equals twenty-seven. Take away twelve. Three x equals fifteen. x equals five.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "3(x + 4) = 27" },
          { expr: "x + 4 = 9", note: "÷ 3 both sides" },
          { expr: "x = 5", note: `${M} 4 both sides` },
        ],
        say: {
          text: "There is also a shortcut. Divide both sides by three first: x plus four equals nine, so x equals five. Same answer.",
          simple: "A shortcut: divide both sides by three. x plus four equals nine. x equals five.",
        },
      },
      {
        type: "contrast",
        wrong: "3(x + 4)  →  3x + 4",
        right: "3(x + 4)  →  3x + 12",
        why: "The 3 multiplies both terms in the bracket.",
        say: {
          text: "The most common mistake is expanding to three x plus four. The three multiplies both terms.",
        },
      },
      {
        type: "rule",
        title: "Expand, then solve",
        body: ["Multiply out the bracket carefully.", "Then solve in steps."],
        say: { text: "Expand the bracket carefully, then solve step by step." },
      },
    ],
  }),
  L({
    id: "eq-fractions-visual",
    skill: "eq-fractions",
    title: "Clear the fraction",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Equations with fractions",
        say: {
          text: "When x is divided by a number, we multiply to clear the fraction.",
          simple: "If x is divided by a number, we multiply to remove the fraction.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "x/4 + 3 = 8" },
          { expr: "x/4 = 5", note: `${M} 3 both sides` },
          { expr: "x = 20", note: "× 4 both sides" },
        ],
        say: {
          text: "x over four, plus three, equals eight. Subtract three: x over four equals five. Multiply both sides by four: x equals twenty.",
          simple: "Take away three. x over four equals five. Multiply by four. x equals twenty.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "(x + 2)/3 = 5" },
          { expr: "x + 2 = 15", note: "× 3 both sides" },
          { expr: "x = 13", note: `${M} 2 both sides` },
        ],
        say: {
          text: "When the whole top is divided, like x plus two, over three, multiply both sides by three first. x plus two equals fifteen. Then x equals thirteen.",
          simple:
            "Here the whole top is divided by three. Multiply both sides by three. x plus two equals fifteen. x equals thirteen.",
        },
      },
      {
        type: "contrast",
        wrong: "x/4 = 5  →  x = 5 ÷ 4",
        right: "x/4 = 5  →  x = 5 × 4 = 20",
        why: "Division is undone by multiplying.",
        say: { text: "Do not divide again. x divided by four is undone by multiplying by four." },
      },
      {
        type: "rule",
        title: "Multiply to clear fractions",
        body: ["Multiply both sides by the bottom number.", "Multiply every term."],
        say: {
          text: "Multiply both sides by the bottom number, and remember to multiply every term.",
        },
      },
    ],
  }),
  L({
    id: "eq-word-visual",
    skill: "eq-word",
    title: "From story to equation",
    style: "visual",
    scenes: [
      {
        type: "intro",
        kicker: "Equations",
        title: "Word problems into equations",
        say: {
          text: "Word problems become easier when you turn the words into an equation.",
          simple: "Turn the words into an equation. Then solve it.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "Kofi thinks of a number, multiplies it by 4 and adds 6. He gets 30." },
          { expr: "Let the number be n" },
          { expr: "4n + 6 = 30", note: "the equation" },
          { expr: "4n = 24, so n = 6" },
        ],
        say: {
          text: "Kofi thinks of a number, multiplies it by four and adds six. He gets thirty. Let the number be n. Then four n plus six equals thirty. Subtract six and divide by four. The number is six.",
          simple:
            "Call the number n. Four n plus six equals thirty. Take away six. Divide by four. n is six.",
        },
      },
      {
        type: "steps",
        lines: [
          { expr: "Ama is 3 years older than Kojo. Their ages add up to 25." },
          { expr: "Kojo = k,  Ama = k + 3" },
          { expr: "k + k + 3 = 25", note: "the equation" },
          { expr: "2k = 22, so k = 11", note: "Kojo is 11" },
        ],
        say: {
          text: "Ama is three years older than Kojo, and their ages add up to twenty-five. Let Kojo be k, so Ama is k plus three. Add them: two k plus three equals twenty-five. So k is eleven. Kojo is eleven and Ama is fourteen.",
          simple:
            "Kojo is k. Ama is k plus three. Together: two k plus three equals twenty-five. k is eleven. Kojo is eleven.",
        },
      },
      {
        type: "rule",
        title: "Three steps",
        body: [
          "1. Name the unknown with a letter.",
          "2. Write the equation.",
          "3. Solve, then check you answered the question.",
        ],
        say: {
          text: "Three steps. Name the unknown with a letter. Write the equation. Then solve, and check that you answered the question asked.",
        },
      },
    ],
  }),

  // Short fixes for specific mistakes. Played after the main lesson when the student has made that mistake.
  L({
    id: "fix-minus-negative",
    skill: "int-add",
    title: "Taking away a debt",
    style: "fix",
    scenes: [
      {
        type: "steps",
        lines: [
          { expr: `5 ${M} (${M}3)` },
          { expr: "take away a debt of 3", note: "think of money" },
          { expr: "5 + 3 = 8" },
        ],
        say: {
          text: "Think of a negative number as a debt. If someone takes away a debt of three cedis, you are three cedis better off. So five minus negative three is eight.",
          simple:
            "A negative is like a debt. If a debt of three cedis is taken away, you have three cedis more. Five minus negative three is eight.",
        },
      },
    ],
  }),
  L({
    id: "fix-sign-rule",
    skill: "int-mul",
    title: "Same or different?",
    style: "fix",
    scenes: [
      {
        type: "contrast",
        wrong: `(${M}4) × (${M}3) = ${M}12`,
        right: `(${M}4) × (${M}3) = 12`,
        why: "Two negatives: same signs, so the answer is positive.",
        say: {
          text: "Ask one question before you write the sign: are the signs the same or different? Same gives positive. Different gives negative.",
        },
      },
    ],
  }),
  L({
    id: "fix-unlike-terms",
    skill: "like-terms",
    title: "Oranges and mangoes",
    style: "fix",
    scenes: [
      {
        type: "contrast",
        wrong: "4x + 3 = 7x",
        right: "4x + 3 stays 4x + 3",
        why: "You cannot add x terms to plain numbers.",
        say: {
          text: "Four oranges and three mangoes are not seven oranges. In the same way, four x plus three cannot be joined. It stays four x plus three.",
        },
      },
    ],
  }),
  L({
    id: "fix-partial-distribute",
    skill: "expand",
    title: "Both terms, every time",
    style: "fix",
    scenes: [
      {
        type: "steps",
        lines: [
          { expr: "5(x + 2)" },
          { expr: "5 × x + 5 × 2", note: "two arrows" },
          { expr: "5x + 10" },
        ],
        say: {
          text: "Draw two arrows from the five: one to the x and one to the two. Five times x is five x. Five times two is ten. Five x plus ten.",
          simple: "The five goes to the x and to the two. Five x plus ten.",
        },
      },
    ],
  }),
  L({
    id: "fix-opposite-operation",
    skill: "eq-one-step",
    title: "Opposites undo",
    style: "fix",
    scenes: [
      {
        type: "contrast",
        wrong: "x + 6 = 10  →  x = 16",
        right: "x + 6 = 10  →  x = 10 − 6 = 4",
        why: "Plus 6 is undone by minus 6.",
        say: {
          text: "To undo something, do its opposite. Plus six is undone by minus six, so x is four. Check: four plus six is ten.",
        },
      },
    ],
  }),
  L({
    id: "fix-undo-order",
    skill: "eq-two-step",
    title: "Last on, first off",
    style: "fix",
    scenes: [
      {
        type: "steps",
        lines: [
          { expr: "2x + 6 = 14" },
          { expr: "2x = 8", note: "remove + 6 first" },
          { expr: "x = 4", note: "then ÷ 2" },
        ],
        say: {
          text: "Think of putting on socks, then shoes. To undo, the shoes come off first. The plus six went on last, so remove it first. Then divide.",
          simple:
            "Socks go on first, then shoes. Shoes come off first. Remove the plus six first. Then divide.",
        },
      },
    ],
  }),
  L({
    id: "fix-move-sign",
    skill: "eq-both-sides",
    title: "Subtract, don't move",
    style: "fix",
    scenes: [
      {
        type: "steps",
        lines: [
          { expr: "6x + 1 = 2x + 9" },
          { expr: `6x ${M} 2x + 1 = 9`, note: `${M} 2x both sides` },
          { expr: "4x = 8, so x = 2" },
        ],
        say: {
          text: "Instead of moving two x, subtract two x from both sides. Six x minus two x is four x. Then four x equals eight, so x equals two.",
        },
      },
    ],
  }),
  L({
    id: "fix-clear-fraction",
    skill: "eq-fractions",
    title: "Multiply every term",
    style: "fix",
    scenes: [
      {
        type: "steps",
        lines: [
          { expr: "x/3 = 7" },
          { expr: "x = 7 × 3", note: "× 3, not ÷ 3" },
          { expr: "x = 21" },
        ],
        say: {
          text: "x is divided by three. The opposite of dividing is multiplying. So multiply both sides by three: x equals twenty-one.",
        },
      },
    ],
  }),
  L({
    id: "fix-answer-the-question",
    skill: "eq-word",
    title: "Answer the question asked",
    style: "fix",
    scenes: [
      {
        type: "rule",
        title: "Before you choose",
        body: [
          "Read the last sentence again.",
          "Who or what is it asking about?",
          "Is your answer that thing?",
        ],
        say: {
          text: "Before you choose an answer, read the last sentence again. Who or what is it asking about? Make sure your answer is that thing, not another number from your working.",
        },
      },
    ],
  }),
];

export const LESSON: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

/** Main lessons for a skill, default style first. */
export function lessonsFor(skill: SkillId): string[] {
  return LESSONS.filter((l) => l.skill === skill && l.style !== "fix").map((l) => l.id);
}

/** Every narration line, for pre-generating audio with AdwenTTS. */
export function narrationLines(): { id: string; text: string; simple: string }[] {
  const out: { id: string; text: string; simple: string }[] = [];
  for (const l of LESSONS) {
    l.scenes.forEach((s, i) =>
      out.push({ id: `${l.id}.${i}`, text: s.say.text, simple: s.say.simple ?? s.say.text }),
    );
  }
  return out;
}
