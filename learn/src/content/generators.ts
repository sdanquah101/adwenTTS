import { Rng } from "../engine/rng";
import { fmtInt, linear, MINUS, paren, signed, term } from "../math/format";
import { Q, q } from "../math/q";
import { FRACTION_GENERATORS } from "./generators-fractions";
import { assemble, expr, near, num, type Check, type Gen, type Item, type Unit } from "./item";
import type { SkillId } from "./skills";

export type { Check, Item, Letter, Option } from "./item";

const LETTER_VARS = ["x", "y", "n", "m", "p"] as const;
const NAMES = [
  "Kwame",
  "Ama",
  "Kofi",
  "Esi",
  "Yaw",
  "Akosua",
  "Kojo",
  "Abena",
  "Kwesi",
  "Efua",
  "Adjoa",
  "Kwabena",
];

const intAdd: Gen = (rng) => {
  const form = rng.int(0, 3);
  if (form === 0) {
    const a = rng.int(2, 15);
    let b = rng.int(2, 15);
    while (b === a) b = rng.int(2, 15);
    const v = b - a;
    return {
      prompt: "Work out:",
      math: `${fmtInt(-a)} + ${b}`,
      options: assemble(
        rng,
        num(v),
        [
          num(-(a + b), "int-add-sizes"),
          num(a + b, "int-ignore-sign"),
          num(a - b, "int-sign-flip"),
        ],
        near(v),
      ),
      solution: [
        `Start at ${fmtInt(-a)} on the number line.`,
        `Adding ${b} moves ${b} steps to the right.`,
        `You land on ${fmtInt(v)}.`,
      ],
      check: { kind: "arith", op: "+", a: -a, b },
    };
  }
  if (form === 1) {
    const a = rng.int(1, 12);
    const b = a + rng.int(2, 12);
    const v = a - b;
    return {
      prompt: "Work out:",
      math: `${a} ${MINUS} ${b}`,
      options: assemble(
        rng,
        num(v),
        [
          num(b - a, "int-sign-flip"),
          num(-(a + b), "int-add-sizes"),
          num(a + b, "int-ignore-sign"),
        ],
        near(v),
      ),
      solution: [
        `Start at ${a}.`,
        `Subtracting ${b} moves ${b} steps to the left, past zero.`,
        `You land on ${fmtInt(v)}.`,
      ],
      check: { kind: "arith", op: "-", a, b },
    };
  }
  if (form === 2) {
    const a = rng.nz(-9, 12);
    const b = rng.int(2, 12);
    const v = a + b;
    return {
      prompt: "Work out:",
      math: `${fmtInt(a)} ${MINUS} (${fmtInt(-b)})`,
      options: assemble(
        rng,
        num(v),
        [
          num(a - b, "int-minus-negative"),
          num(-(a + b), "int-sign-flip"),
          num(Math.abs(a) + b, "int-ignore-sign"),
        ],
        near(v),
      ),
      solution: [
        "Minus a negative becomes plus.",
        `${fmtInt(a)} ${MINUS} (${fmtInt(-b)}) = ${fmtInt(a)} + ${b}`,
        `= ${fmtInt(v)}`,
      ],
      check: { kind: "arith", op: "-", a, b: -b },
    };
  }
  const a = rng.int(2, 12);
  const b = rng.int(2, 12);
  const v = -(a + b);
  return {
    prompt: "Work out:",
    math: `${fmtInt(-a)} ${MINUS} ${b}`,
    options: assemble(
      rng,
      num(v),
      [num(a + b, "int-sign-flip"), num(a - b, "int-ignore-sign"), num(b - a)],
      near(v),
    ),
    solution: [
      `Start at ${fmtInt(-a)}.`,
      `Subtracting ${b} moves ${b} more steps to the left.`,
      `You land on ${fmtInt(v)}.`,
    ],
    check: { kind: "arith", op: "-", a: -a, b },
  };
};

const intMul: Gen = (rng) => {
  const form = rng.int(0, 3);
  const a = rng.int(2, 9);
  const b = rng.int(2, 9);
  const signs = (same: boolean) =>
    same
      ? "The signs are the same, so the answer is positive."
      : "The signs are different, so the answer is negative.";
  if (form === 0) {
    const v = -a * b;
    return {
      prompt: "Work out:",
      math: `(${fmtInt(-a)}) × ${b}`,
      options: assemble(
        rng,
        num(v),
        [num(a * b, "int-sign-rule"), num(b - a, "int-wrong-operation")],
        near(v),
      ),
      solution: [`Numbers first: ${a} × ${b} = ${a * b}.`, signs(false), `Answer: ${fmtInt(v)}`],
      check: { kind: "arith", op: "*", a: -a, b },
    };
  }
  if (form === 1) {
    const v = a * b;
    return {
      prompt: "Work out:",
      math: `(${fmtInt(-a)}) × (${fmtInt(-b)})`,
      options: assemble(
        rng,
        num(v),
        [num(-v, "int-sign-rule"), num(-(a + b), "int-wrong-operation")],
        near(v),
      ),
      solution: [`Numbers first: ${a} × ${b} = ${a * b}.`, signs(true), `Answer: ${fmtInt(v)}`],
      check: { kind: "arith", op: "*", a: -a, b: -b },
    };
  }
  if (form === 2) {
    const v = -a;
    return {
      prompt: "Work out:",
      math: `${fmtInt(-a * b)} ÷ ${b}`,
      options: assemble(
        rng,
        num(v),
        [num(a, "int-sign-rule"), num(-a * b * b, "int-wrong-operation")],
        near(v),
      ),
      solution: [`Numbers first: ${a * b} ÷ ${b} = ${a}.`, signs(false), `Answer: ${fmtInt(v)}`],
      check: { kind: "arith", op: "/", a: -a * b, b },
    };
  }
  const v = a;
  return {
    prompt: "Work out:",
    math: `${fmtInt(-a * b)} ÷ (${fmtInt(-b)})`,
    options: assemble(
      rng,
      num(v),
      [num(-a, "int-sign-rule"), num(a * b * b, "int-wrong-operation")],
      near(v),
    ),
    solution: [`Numbers first: ${a * b} ÷ ${b} = ${a}.`, signs(true), `Answer: ${fmtInt(v)}`],
    check: { kind: "arith", op: "/", a: -a * b, b: -b },
  };
};

const likeTerms: Gen = (rng) => {
  const a = rng.int(2, 9);
  let c = rng.nz(-6, 9);
  while (a + c === 0) c = rng.nz(-6, 9);
  const b = rng.nz(-9, 9);
  let d = rng.nz(-9, 9);
  while (b + d === 0) d = rng.nz(-9, 9);
  const parts = rng.chance(0.7)
    ? [{ coef: a, v: "x" }, { coef: b }, { coef: c, v: "x" }, { coef: d }]
    : [{ coef: b }, { coef: a, v: "x" }, { coef: d }, { coef: c, v: "x" }];
  const A = a + c;
  const B = b + d;
  const total = a + b + c + d;
  const signDrop =
    c < 0 || d < 0
      ? expr(a + Math.abs(c), b + Math.abs(d), "alg-sign-error")
      : expr(A, b - d, "alg-sign-error");
  const distractors = [signDrop, expr(A, B, "alg-add-powers", 2)];
  if (total !== 0) distractors.unshift(expr(total, 0, "alg-combine-unlike"));
  const op = (n: number) => (n < 0 ? MINUS : "+");
  return {
    prompt: "Simplify:",
    math: signed(parts),
    options: assemble(rng, expr(A, B), distractors, (i) => expr(A + (i % 2 ? i : -i), B)),
    solution: [
      `x terms: ${term(a)} ${op(c)} ${term(Math.abs(c))} = ${term(A)}`,
      `Numbers: ${fmtInt(b)} ${op(d)} ${Math.abs(d)} = ${fmtInt(B)}`,
      `Answer: ${linear(A, B)}`,
    ],
    check: {
      kind: "collect",
      terms: [
        { coef: a, x: true },
        { coef: b, x: false },
        { coef: c, x: true },
        { coef: d, x: false },
      ],
    },
  };
};

const expand: Gen = (rng) => {
  const k = rng.int(2, 9) * (rng.chance(0.3) ? -1 : 1);
  const a = rng.int(1, 6);
  const b = rng.nz(-9, 9);
  const distractors = [
    expr(k * a, b, "alg-partial-distribute"),
    expr(k * a, -k * b, "alg-sign-error"),
  ];
  if (k + a !== 0) distractors.push(expr(k + a, k + b, "alg-add-instead"));
  return {
    prompt: "Expand:",
    math: `${fmtInt(k)}(${linear(a, b)})`,
    options: assemble(rng, expr(k * a, k * b), distractors, (i) =>
      expr(k * a, k * b + (i % 2 ? i : -i)),
    ),
    solution: [
      `Multiply each term in the bracket by ${fmtInt(k)}.`,
      `${paren(k)} × ${term(a)} = ${term(k * a)}`,
      `${paren(k)} × ${paren(b)} = ${fmtInt(k * b)}`,
      `Answer: ${linear(k * a, k * b)}`,
    ],
    check: { kind: "expand", k, a, b },
  };
};

const eq = (l0: Q | number, l1: Q | number, r0: Q | number, r1: Q | number): Check => ({
  kind: "equation",
  left: [q(l0), q(l1)],
  right: [q(r0), q(r1)],
});

/** "Subtract 5" / "Add 5" for removing a constant b from a side. */
const removeConst = (b: number) =>
  b > 0 ? `Subtract ${b} from both sides` : `Add ${-b} to both sides`;

const eqOneStep: Gen = (rng) => {
  const v = rng.pick(LETTER_VARS);
  const form = rng.int(0, 3);
  const prompt = `Solve for ${v}:`;
  if (form === 0) {
    const a = rng.int(2, 15);
    const x = rng.nz(-5, 15);
    const b = x + a;
    return {
      prompt,
      math: `${v} + ${a} = ${fmtInt(b)}`,
      options: assemble(
        rng,
        num(x),
        [num(b + a, "eq-same-operation"), num(a - b, "eq-sign-error")],
        near(x),
      ),
      solution: [
        `Subtract ${a} from both sides.`,
        `${v} = ${fmtInt(b)} ${MINUS} ${a}`,
        `${v} = ${fmtInt(x)}`,
      ],
      check: eq(1, a, 0, b),
    };
  }
  if (form === 1) {
    const a = rng.int(2, 15);
    const x = rng.nz(-5, 20);
    const b = x - a;
    return {
      prompt,
      math: `${v} ${MINUS} ${a} = ${fmtInt(b)}`,
      options: assemble(
        rng,
        num(x),
        [num(b - a, "eq-same-operation"), num(-x, "eq-sign-error")],
        near(x),
      ),
      solution: [`Add ${a} to both sides.`, `${v} = ${fmtInt(b)} + ${a}`, `${v} = ${fmtInt(x)}`],
      check: eq(1, -a, 0, b),
    };
  }
  if (form === 2) {
    const a = rng.int(2, 9);
    const x = rng.nz(-9, 12);
    const b = a * x;
    return {
      prompt,
      math: `${a}${v} = ${fmtInt(b)}`,
      options: assemble(
        rng,
        num(x),
        [
          num(b * a, "eq-same-operation"),
          num(b - a, "eq-wrong-inverse"),
          num(new Q(a, b), "eq-divide-wrong-way"),
        ],
        near(x),
      ),
      solution: [`Divide both sides by ${a}.`, `${v} = ${fmtInt(b)} ÷ ${a}`, `${v} = ${fmtInt(x)}`],
      check: eq(a, 0, 0, b),
    };
  }
  const a = rng.int(2, 9);
  const b = rng.nz(-9, 12);
  const x = a * b;
  return {
    prompt,
    math: `${v}/${a} = ${fmtInt(b)}`,
    options: assemble(
      rng,
      num(x),
      [num(new Q(b, a), "eq-same-operation"), num(b + a, "eq-wrong-inverse")],
      near(x),
    ),
    solution: [`Multiply both sides by ${a}.`, `${v} = ${fmtInt(b)} × ${a}`, `${v} = ${fmtInt(x)}`],
    check: eq(new Q(1, a), 0, 0, b),
  };
};

const eqTwoStep: Gen = (rng) => {
  const v = rng.pick(LETTER_VARS);
  const a = rng.int(2, 9);
  const x = rng.nz(-6, 12);
  const b = rng.nz(-15, 15);
  const c = a * x + b;
  return {
    prompt: `Solve for ${v}:`,
    math: `${linear(a, b, v)} = ${fmtInt(c)}`,
    options: assemble(
      rng,
      num(x),
      [
        num(new Q(c + b, a), "eq-same-operation"),
        num(new Q(c, a).sub(b), "eq-order-of-undoing"),
        num(c - b - a, "eq-wrong-inverse"),
        num((c - b) * a, "eq-same-operation"),
      ],
      near(x),
    ),
    solution: [
      `${removeConst(b)}: ${term(a, v)} = ${fmtInt(c - b)}`,
      `Divide both sides by ${a}: ${v} = ${fmtInt(x)}`,
      `Check: ${a} × ${paren(x)} ${b < 0 ? MINUS : "+"} ${Math.abs(b)} = ${fmtInt(c)}, so it works.`,
    ],
    check: eq(a, b, 0, c),
  };
};

const eqBothSides: Gen = (rng) => {
  const v = rng.pick(LETTER_VARS);
  for (;;) {
    const a = rng.int(3, 9);
    const c = rng.int(1, a - 1);
    const x = rng.nz(-5, 10);
    const b = rng.nz(-12, 12);
    const d = (a - c) * x + b;
    if (d === 0) continue;
    const k = a - c;
    const steps = [
      `Subtract ${term(c, v)} from both sides: ${linear(k, b, v)} = ${fmtInt(d)}`,
      `${removeConst(b)}: ${term(k, v)} = ${fmtInt(d - b)}`,
    ];
    if (k !== 1) steps.push(`Divide both sides by ${k}: ${v} = ${fmtInt(x)}`);
    return {
      prompt: `Solve for ${v}:`,
      math: `${linear(a, b, v)} = ${linear(c, d, v)}`,
      options: assemble(
        rng,
        num(x),
        [
          num(new Q(d - b, a + c), "eq-move-no-sign-change"),
          num(new Q(d + b, k), "eq-move-no-sign-change"),
          num(new Q(d - b, a), "eq-ignore-term"),
        ],
        near(x),
      ),
      solution: steps,
      check: eq(a, b, c, d),
    };
  }
};

const eqBrackets: Gen = (rng) => {
  const v = rng.pick(LETTER_VARS);
  const k = rng.int(2, 6);
  const b = rng.nz(-8, 8);
  let x = rng.nz(-6, 10);
  while (x + b === 0) x = rng.nz(-6, 10);
  const c = k * (x + b);
  return {
    prompt: `Solve for ${v}:`,
    math: `${k}(${linear(1, b, v)}) = ${fmtInt(c)}`,
    options: assemble(
      rng,
      num(x),
      [
        num(new Q(c - b, k), "alg-partial-distribute"),
        num(new Q(c, k).add(b), "eq-sign-error"),
        num(new Q(c, k), "eq-ignore-term"),
      ],
      near(x),
    ),
    solution: [
      `Expand the bracket: ${linear(k, k * b, v)} = ${fmtInt(c)}`,
      `${removeConst(k * b)}: ${term(k, v)} = ${fmtInt(c - k * b)}`,
      `Divide both sides by ${k}: ${v} = ${fmtInt(x)}`,
    ],
    check: eq(k, k * b, 0, c),
  };
};

const eqFractions: Gen = (rng) => {
  const v = rng.pick(LETTER_VARS);
  const a = rng.int(2, 6);
  if (rng.chance(0.55)) {
    const k = rng.nz(-5, 9);
    const x = a * k;
    const b = rng.nz(-9, 9);
    const c = k + b;
    return {
      prompt: `Solve for ${v}:`,
      math: `${v}/${a} ${b < 0 ? MINUS : "+"} ${Math.abs(b)} = ${fmtInt(c)}`,
      options: assemble(
        rng,
        num(x),
        [
          num(new Q(c - b, a), "eq-divide-not-multiply"),
          num(a * c - b, "eq-multiply-one-term"),
          num(a * (c + b), "eq-same-operation"),
        ],
        near(x),
      ),
      solution: [
        `${removeConst(b)}: ${v}/${a} = ${fmtInt(c - b)}`,
        `Multiply both sides by ${a}: ${v} = ${fmtInt(x)}`,
      ],
      check: eq(new Q(1, a), b, 0, c),
    };
  }
  for (;;) {
    const c = rng.nz(-6, 9);
    const b = rng.nz(-9, 9);
    const x = a * c - b;
    if (x === 0) continue;
    return {
      prompt: `Solve for ${v}:`,
      math: `(${linear(1, b, v)})/${a} = ${fmtInt(c)}`,
      options: assemble(
        rng,
        num(x),
        [
          num(a * c + b, "eq-sign-error"),
          num(new Q(c, a).sub(b), "eq-divide-not-multiply"),
          num(a * (c - b), "eq-multiply-one-term"),
        ],
        near(x),
      ),
      solution: [
        `Multiply both sides by ${a}: ${linear(1, b, v)} = ${fmtInt(a * c)}`,
        `${removeConst(b)}: ${v} = ${fmtInt(x)}`,
      ],
      check: eq(new Q(1, a), new Q(b, a), 0, c),
    };
  }
};

const eqWord: Gen = (rng) => {
  const [n1, n2] = rng.shuffle([...NAMES]) as [string, string];
  const form = rng.int(0, 3);
  if (form === 0) {
    const x = rng.int(2, 15);
    const a = rng.int(2, 9);
    const b = rng.int(1, 20);
    const c = a * x + b;
    return {
      prompt: `${n1} thinks of a number, multiplies it by ${a} and then adds ${b}. The result is ${c}. What is the number?`,
      options: assemble(
        rng,
        num(x),
        [
          num(new Q(c + b, a), "eq-same-operation"),
          num(new Q(c, a).sub(b), "eq-order-of-undoing"),
          num(c - b, "word-incomplete"),
        ],
        near(x, {}, true),
      ),
      solution: [
        `Let the number be n: ${a}n + ${b} = ${c}`,
        `Subtract ${b}: ${a}n = ${c - b}`,
        `Divide by ${a}: n = ${x}`,
      ],
      check: eq(a, b, 0, c),
    };
  }
  if (form === 1) {
    const k = rng.int(5, 15);
    const a = rng.int(2, 8);
    const s = 2 * k + a;
    const u: Unit = { post: " years" };
    return {
      prompt: `${n1} is ${a} years older than ${n2}. The sum of their ages is ${s}. How old is ${n2}?`,
      options: assemble(
        rng,
        num(k, undefined, u),
        [
          num(k + a, "word-wrong-unknown", u),
          num(s - a, "word-incomplete", u),
          num(new Q(s, 2), "word-ignored-difference", u),
        ],
        near(k, u, true),
      ),
      solution: [
        `Let ${n2} be k years old. Then ${n1} is k + ${a}.`,
        `k + k + ${a} = ${s}, so 2k + ${a} = ${s}`,
        `2k = ${s - a}, so k = ${k}`,
        `${n2} is ${k} years old.`,
      ],
      check: eq(2, a, 0, s),
    };
  }
  if (form === 2) {
    const p = rng.int(2, 12);
    const n = rng.int(2, 8);
    const b = rng.int(1, 9);
    const c = n * p + b;
    const u: Unit = { pre: "GH₵" };
    return {
      prompt: `${n1} buys ${n} exercise books and one pen. The pen costs GH₵${b}. ${n1} pays GH₵${c} altogether. How much does one exercise book cost?`,
      options: assemble(
        rng,
        num(p, undefined, u),
        [
          num(new Q(c + b, n), "eq-same-operation", u),
          num(new Q(c, n).sub(b), "eq-order-of-undoing", u),
          num(c - b, "word-incomplete", u),
        ],
        near(p, u, true),
      ),
      solution: [
        `Let one book cost GH₵p: ${n}p + ${b} = ${c}`,
        `${n}p = ${c - b}`,
        `p = ${p}, so one book costs GH₵${p}.`,
      ],
      check: eq(n, b, 0, c),
    };
  }
  const w = rng.int(2, 12);
  const d = rng.int(1, 8);
  const P = 4 * w + 2 * d;
  const u: Unit = { post: " cm" };
  return {
    prompt: `The length of a rectangle is ${d} cm more than its width. Its perimeter is ${P} cm. Find the width.`,
    options: assemble(
      rng,
      num(w, undefined, u),
      [
        num(new Q(P - d, 4), "alg-partial-distribute", u),
        num(new Q(P - 2 * d, 2), "word-incomplete", u),
        num(new Q(P, 4), "word-ignored-difference", u),
      ],
      near(w, u, true),
    ),
    solution: [
      `Let the width be w cm. The length is w + ${d}.`,
      `Perimeter: 2(w + w + ${d}) = ${P}, so 4w + ${2 * d} = ${P}`,
      `4w = ${P - 2 * d}, so w = ${w}`,
    ],
    check: eq(4, 2 * d, 0, P),
  };
};

export const GENERATORS: Record<SkillId, Gen> = {
  "int-add": intAdd,
  "int-mul": intMul,
  "like-terms": likeTerms,
  expand,
  "eq-one-step": eqOneStep,
  "eq-two-step": eqTwoStep,
  "eq-both-sides": eqBothSides,
  "eq-brackets": eqBrackets,
  "eq-fractions": eqFractions,
  "eq-word": eqWord,
  ...FRACTION_GENERATORS,
};

/** Build one question for a skill. The same (skill, seed) always gives the same question. */
export function makeItem(skill: SkillId, seed: number): Item {
  const body = GENERATORS[skill](new Rng(seed));
  return { id: `${skill}:${seed}`, skill, seed, ...body };
}
