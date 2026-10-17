import type { Rng } from "../engine/rng";
import { fmtDec, fmtMixed, fmtPct, isTerminating, MINUS } from "../math/format";
import { gcd, lcm, Q, q } from "../math/q";
import { assemble, num, type Cand, type Gen } from "./item";
import type { MisconceptionId } from "./misconceptions";
import type { SkillId } from "./skills";

/** Fraction answer in simplest form, mixed number when bigger than 1. Compared by value. */
const frac = (v: Q | number, m?: MisconceptionId): Cand => ({
  text: fmtMixed(v),
  key: q(v).key(),
  misconception: m,
});
/** A fraction exactly as written (9/12 is not 3/4 here). Used where simplest form is the point. */
const raw = (n: number, d: number, m?: MisconceptionId): Cand => ({
  text: `${n}/${d}`,
  key: `r:${n}/${d}`,
  misconception: m,
});
const pct = (v: Q | number, m?: MisconceptionId): Cand => ({
  text: fmtPct(v),
  key: `p:${q(v).key()}`,
  misconception: m,
});
const money = (v: Q | number, m?: MisconceptionId): Cand => ({
  text: `GH₵${fmtDec(v)}`,
  key: q(v).key(),
  misconception: m,
});
const plain = (v: Q | number, m?: MisconceptionId): Cand => ({
  text: fmtDec(v),
  key: q(v).key(),
  misconception: m,
});

const offset = (i: number) => Math.ceil(i / 2) * (i % 2 ? 1 : -1);
const positive = (make: (v: Q) => Cand, base: Q, step: Q) => (i: number) => {
  const v = base.add(step.mul(offset(i)));
  return v.n > 0 ? make(v) : null;
};

/** A proper fraction already in simplest form. */
function proper(rng: Rng, dens: readonly number[]): [number, number] {
  const d = rng.pick(dens);
  let n = rng.int(1, d - 1);
  while (gcd(n, d) !== 1) n = rng.int(1, d - 1);
  return [n, d];
}

const fracSimplify: Gen = (rng) => {
  if (rng.chance(0.6)) {
    const [p, qd] = proper(rng, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const k = rng.pick([2, 3, 4, 5, 6, 8, 9, 10, 12]);
    const N = p * k;
    const D = qd * k;
    const factors = [2, 3, 4, 5, 6].filter((f) => f < k && k % f === 0);
    const distractors: Cand[] = [];
    if (factors.length) {
      const f = rng.pick(factors);
      distractors.push(raw(N / f, D / f, "frac-partial-simplify"));
    }
    if (p > 1) distractors.push(raw(qd, p, "frac-flip"));
    distractors.push(raw(p, D, "frac-divide-one-part"), raw(N, qd, "frac-divide-one-part"));
    return {
      prompt: "Write in its simplest form:",
      math: `${N}/${D}`,
      options: assemble(rng, raw(p, qd), distractors, (i) => raw(p, qd + i)),
      solution: [
        `The biggest number that divides both ${N} and ${D} is ${k}.`,
        `${N} ÷ ${k} = ${p} and ${D} ÷ ${k} = ${qd}`,
        `Answer: ${p}/${qd}`,
      ],
      check: { kind: "simplify", n: N, d: D },
    };
  }
  const [p, qd] = proper(rng, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const k = rng.int(2, 9);
  const D = qd * k;
  return {
    prompt: "Find the missing number:",
    math: `${p}/${qd} = ?/${D}`,
    options: assemble(rng, num(p * k), [num(p + D - qd, "frac-add-to-equivalent"), num(k)], (i) => {
      const v = p * k + offset(i);
      return v > 0 ? num(v) : null;
    }),
    solution: [
      `${qd} × ${k} = ${D}, so the bottom was multiplied by ${k}.`,
      `Multiply the top by ${k} too: ${p} × ${k} = ${p * k}`,
    ],
    check: { kind: "missing", p, q: qd, D },
  };
};

const DENS = [2, 3, 4, 5, 6, 8, 9, 10, 12] as const;

function twoFractions(rng: Rng): { a: number; b: number; c: number; d: number; L: number } {
  for (;;) {
    const [a, b] = proper(rng, DENS);
    const [c, d] = proper(rng, DENS);
    if (b !== d) return { a, b, c, d, L: lcm(b, d) };
  }
}

const fracAdd: Gen = (rng) => {
  const form = rng.int(0, 2);
  if (form === 0) {
    const { a, b, c, d, L } = twoFractions(rng);
    const A = a * (L / b);
    const C = c * (L / d);
    const res = new Q(a, b).add(new Q(c, d));
    const steps = [
      `Common denominator: ${L}`,
      `${a}/${b} = ${A}/${L} and ${c}/${d} = ${C}/${L}`,
      `${A}/${L} + ${C}/${L} = ${A + C}/${L}`,
    ];
    if (res.d !== L || res.n >= res.d) steps.push(`= ${fmtMixed(res)}`);
    return {
      prompt: "Work out:",
      math: `${a}/${b} + ${c}/${d}`,
      options: assemble(
        rng,
        frac(res),
        [
          frac(new Q(a + c, b + d), "frac-add-across"),
          frac(new Q(a + c, L), "frac-numerators-unchanged"),
          frac(new Q(a * c, b * d), "frac-wrong-operation"),
        ],
        positive(frac, res, new Q(1, L)),
      ),
      solution: steps,
      check: { kind: "frac-op", op: "+", a: [a, b], b: [c, d] },
    };
  }
  if (form === 1) {
    for (;;) {
      const { a, b, c, d, L } = twoFractions(rng);
      const res = new Q(a, b).sub(new Q(c, d));
      if (res.n <= 0) continue;
      const A = a * (L / b);
      const C = c * (L / d);
      const distractors: Cand[] = [];
      if (a - c > 0 && b - d > 0) distractors.push(frac(new Q(a - c, b - d), "frac-add-across"));
      if (a - c > 0) distractors.push(frac(new Q(a - c, L), "frac-numerators-unchanged"));
      distractors.push(frac(new Q(a, b).add(new Q(c, d)), "frac-wrong-operation"));
      const steps = [
        `Common denominator: ${L}`,
        `${a}/${b} = ${A}/${L} and ${c}/${d} = ${C}/${L}`,
        `${A}/${L} ${MINUS} ${C}/${L} = ${A - C}/${L}`,
      ];
      if (res.d !== L) steps.push(`= ${fmtMixed(res)}`);
      return {
        prompt: "Work out:",
        math: `${a}/${b} ${MINUS} ${c}/${d}`,
        options: assemble(rng, frac(res), distractors, positive(frac, res, new Q(1, L))),
        solution: steps,
        check: { kind: "frac-op", op: "-", a: [a, b], b: [c, d] },
      };
    }
  }
  const { a, b, c, d, L } = twoFractions(rng);
  const w1 = rng.int(1, 4);
  const w2 = rng.int(1, 3);
  const fracSum = new Q(a, b).add(new Q(c, d));
  const res = fracSum.add(w1 + w2);
  const A = a * (L / b);
  const C = c * (L / d);
  const carry = fracSum.n > fracSum.d;
  const steps = [
    `Whole numbers: ${w1} + ${w2} = ${w1 + w2}`,
    `Fractions: ${A}/${L} + ${C}/${L} = ${A + C}/${L}`,
  ];
  if (carry) steps.push(`${A + C}/${L} = ${fmtMixed(fracSum)}, so carry 1 whole`);
  steps.push(`Answer: ${fmtMixed(res)}`);
  return {
    prompt: "Work out:",
    math: `${w1} ${a}/${b} + ${w2} ${c}/${d}`,
    options: assemble(
      rng,
      frac(res),
      [
        frac(new Q(a + c, b + d).add(w1 + w2), "frac-add-across"),
        frac(new Q(a + c, L).add(w1 + w2), "frac-numerators-unchanged"),
        carry
          ? frac(res.sub(1), "frac-forgot-carry")
          : frac(new Q(a * c, b * d).add(w1 + w2), "frac-wrong-operation"),
      ],
      positive(frac, res, new Q(1, L)),
    ),
    solution: steps,
    check: { kind: "frac-op", op: "+", a: [w1 * b + a, b], b: [w2 * d + c, d] },
  };
};

const fracMul: Gen = (rng) => {
  const form = rng.int(0, 2);
  const dens = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  if (form === 0) {
    const [a, b] = proper(rng, dens);
    const [c, d] = proper(rng, dens);
    const res = new Q(a * c, b * d);
    const steps = [
      `Tops: ${a} × ${c} = ${a * c}`,
      `Bottoms: ${b} × ${d} = ${b * d}`,
      `${a * c}/${b * d}`,
    ];
    if (res.d !== b * d) steps[2] += ` = ${fmtMixed(res)}`;
    return {
      prompt: "Work out:",
      math: `${a}/${b} × ${c}/${d}`,
      options: assemble(
        rng,
        frac(res),
        [
          frac(new Q(a * d, b * c), "frac-cross-multiply"),
          frac(new Q(a, b).add(new Q(c, d)), "frac-wrong-operation"),
        ],
        positive(frac, res, new Q(1, res.d)),
      ),
      solution: steps,
      check: { kind: "frac-op", op: "*", a: [a, b], b: [c, d] },
    };
  }
  if (form === 1) {
    const [a, b] = proper(rng, dens);
    const [c, d] = proper(rng, dens);
    const res = new Q(a * d, b * c);
    return {
      prompt: "Work out:",
      math: `${a}/${b} ÷ ${c}/${d}`,
      options: assemble(
        rng,
        frac(res),
        [
          frac(new Q(a * c, b * d), "frac-divide-no-flip"),
          frac(new Q(b * c, a * d), "frac-flip-wrong-one"),
        ],
        positive(frac, res, new Q(1, res.d)),
      ),
      solution: [
        `Keep ${a}/${b}, change ÷ to ×, flip ${c}/${d} to ${d}/${c}.`,
        `${a}/${b} × ${d}/${c} = ${a * d}/${b * c}`,
        ...(res.d !== b * c || res.n > res.d ? [`= ${fmtMixed(res)}`] : []),
      ],
      check: { kind: "frac-op", op: "/", a: [a, b], b: [c, d] },
    };
  }
  const b = rng.pick([3, 4, 5, 6, 8, 10]);
  let a = rng.int(2, b - 1);
  while (gcd(a, b) !== 1) a = rng.int(2, b - 1);
  const m = rng.int(2, 12);
  const N = b * m;
  return {
    prompt: "Work out:",
    math: `${a}/${b} of ${N}`,
    options: assemble(
      rng,
      num(a * m),
      [
        num(m, "frac-of-incomplete"),
        num(N * a, "frac-of-incomplete"),
        frac(new Q(N * b, a), "frac-flip"),
      ],
      (i) => (a * m + offset(i) > 0 ? num(a * m + offset(i)) : null),
    ),
    solution: [`“Of” means multiply.`, `${N} ÷ ${b} = ${m}`, `${m} × ${a} = ${a * m}`],
    check: { kind: "frac-op", op: "*", a: [a, b], b: [N, 1] },
  };
};

const fracDecPct: Gen = (rng) => {
  const form = rng.int(0, 2);
  if (form === 0) {
    const [n, d] = proper(rng, [2, 4, 5, 8, 10, 20, 25, 50]);
    const P = new Q(100 * n, d);
    const flip = new Q(100 * d, n);
    const distractors = [
      pct(Number(`${n}${d}`), "pct-digits-as-percent"),
      pct(new Q(n, d), "pct-forgot-100"),
    ];
    if (isTerminating(flip)) distractors.push(pct(flip, "frac-flip"));
    return {
      prompt: "Write as a percentage:",
      math: `${n}/${d}`,
      options: assemble(rng, pct(P), distractors, positive(pct, P, new Q(5))),
      solution: [
        `${n} ÷ ${d} = ${fmtDec(new Q(n, d))}`,
        `${fmtDec(new Q(n, d))} × 100 = ${fmtPct(P)}`,
      ],
      check: { kind: "convert", to: "pct", value: new Q(n, d) },
    };
  }
  if (form === 1) {
    const p = rng.pick([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]);
    const v = new Q(p, 100);
    return {
      prompt: "Write as a fraction in its simplest form:",
      math: `${p}%`,
      options: assemble(
        rng,
        frac(v),
        [frac(new Q(p, 10), "pct-over-ten"), frac(new Q(100, p), "frac-flip")],
        positive(frac, v, new Q(5, 100)),
      ),
      solution: [`${p}% = ${p}/100`, `Simplify: ${p}/100 = ${fmtMixed(v)}`],
      check: { kind: "convert", to: "frac", value: v },
    };
  }
  const P = rng.pick([
    new Q(7),
    new Q(35),
    new Q(60),
    new Q(25, 2),
    new Q(125),
    new Q(5),
    new Q(80),
    new Q(45),
    new Q(5, 2),
    new Q(150),
  ]);
  const dec = P.div(100);
  return {
    prompt: "Write as a percentage:",
    math: fmtDec(dec),
    options: assemble(
      rng,
      pct(P),
      [
        pct(P.mul(10), "pct-place-value"),
        pct(dec, "pct-forgot-100"),
        pct(P.div(10), "pct-place-value"),
      ],
      positive(pct, P, new Q(1)),
    ),
    solution: [
      "Multiply by 100: move the decimal point two places to the right.",
      `${fmtDec(dec)} × 100 = ${fmtPct(P)}`,
    ],
    check: { kind: "convert", to: "pct", value: dec },
  };
};

const PCTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 80];
const AMOUNTS = [40, 60, 80, 120, 160, 200, 240, 300, 400, 500, 600, 800];

const pctOf: Gen = (rng) => {
  let p = 0;
  let A = 0;
  do {
    p = rng.pick(PCTS);
    A = rng.pick(AMOUNTS);
  } while ((p * A) % 100 !== 0);
  const res = (p * A) / 100;
  const solution = [`${p}% of ${A} = ${p}/100 × ${A}`, `= ${res}`];
  const check = { kind: "pct-of" as const, p, amount: A };
  const form = rng.int(0, 2);
  if (form === 0) {
    return {
      prompt: `Find ${p}% of GH₵${A}.`,
      options: assemble(
        rng,
        money(res),
        [
          money(new Q(p * A, 10), "pct-place-value"),
          money(A - res, "pct-wrong-part"),
          money(A - p, "pct-percent-as-amount"),
        ],
        positive(money, new Q(res), new Q(5)),
      ),
      solution,
      check,
    };
  }
  const prompt =
    form === 1
      ? `A school has ${A} students. ${p}% of them are girls. How many girls are in the school?`
      : `A farmer harvested ${A} bags of maize and sold ${p}% of them. How many bags did the farmer sell?`;
  return {
    prompt,
    options: assemble(
      rng,
      plain(res),
      [
        plain(A - res, "pct-wrong-part"),
        plain(new Q(p * A, 10), "pct-place-value"),
        plain(A - p, "pct-percent-as-amount"),
      ],
      positive(plain, new Q(res), new Q(5)),
    ),
    solution,
    check,
  };
};

const ITEMS = [
  "bag of rice",
  "school bag",
  "pair of sandals",
  "mobile phone",
  "bicycle",
  "radio",
  "gas cylinder",
  "pair of school shoes",
];
const PRICES = [80, 120, 150, 200, 240, 250, 300, 400, 500, 600];

const pctChange: Gen = (rng) => {
  const item = rng.pick(ITEMS);
  const form = rng.int(0, 2);
  if (form < 2) {
    let P = 0;
    let r = 0;
    do {
      P = rng.pick(PRICES);
      r = rng.pick([10, 20, 25, 30, 40, 50]);
    } while ((P * r) % 100 !== 0);
    const part = (P * r) / 100;
    if (form === 0) {
      const res = P - part;
      return {
        prompt: `A ${item} costs GH₵${P}. In a sale the price is reduced by ${r}%. What is the sale price?`,
        options: assemble(
          rng,
          money(res),
          [
            money(part, "pct-wrong-part"),
            money(P - r, "pct-percent-as-amount"),
            money(P + part, "pct-direction"),
          ],
          positive(money, new Q(res), new Q(10)),
        ),
        solution: [
          `${r}% of ${P} = ${r}/100 × ${P} = ${part}`,
          `Sale price: ${P} ${MINUS} ${part} = GH₵${res}`,
        ],
        check: { kind: "pct-new", P, r: -r },
      };
    }
    const res = P + part;
    return {
      prompt: `The price of a ${item} was GH₵${P}. It increased by ${r}%. What is the new price?`,
      options: assemble(
        rng,
        money(res),
        [
          money(part, "pct-wrong-part"),
          money(P + r, "pct-percent-as-amount"),
          money(P - part, "pct-direction"),
        ],
        positive(money, new Q(res), new Q(10)),
      ),
      solution: [
        `${r}% of ${P} = ${r}/100 × ${P} = ${part}`,
        `New price: ${P} + ${part} = GH₵${res}`,
      ],
      check: { kind: "pct-new", P, r },
    };
  }
  const up = rng.chance(0.5);
  let P = 0;
  let r = 0;
  do {
    P = rng.pick([20, 40, 50, 80, 100, 120, 160, 200, 240, 400]);
    r = up ? rng.pick([25, 60, 100]) : rng.pick([20, 50, 60, 75]);
  } while ((P * r) % 100 !== 0);
  const N = up ? (P * (100 + r)) / 100 : (P * (100 - r)) / 100;
  const diff = Math.abs(N - P);
  const trade = rng.chance(0.5);
  const prompt = up
    ? trade
      ? `A trader buys a ${item} for GH₵${P} and sells it for GH₵${N}. What is the percentage profit?`
      : `The price of a ${item} rose from GH₵${P} to GH₵${N}. Find the percentage increase.`
    : trade
      ? `A trader buys a ${item} for GH₵${P} but has to sell it for GH₵${N}. What is the percentage loss?`
      : `The price of a ${item} fell from GH₵${P} to GH₵${N}. Find the percentage decrease.`;
  return {
    prompt,
    options: assemble(
      rng,
      pct(r),
      [
        pct(new Q(diff * 100, N), "pct-wrong-base"),
        pct(diff, "pct-percent-as-amount"),
        pct(new Q(N * 100, P), "pct-ratio-not-change"),
      ],
      positive(pct, new Q(r), new Q(5)),
    ),
    solution: [
      `Change: ${Math.max(N, P)} ${MINUS} ${Math.min(N, P)} = ${diff}`,
      `${diff}/${P} × 100 = ${r}%`,
      `Divide by the original amount, GH₵${P}, not the new one.`,
    ],
    check: { kind: "pct-change", P, N },
  };
};

export const FRACTION_GENERATORS: Record<
  Extract<SkillId, `frac-${string}` | `pct-${string}`>,
  Gen
> = {
  "frac-simplify": fracSimplify,
  "frac-add": fracAdd,
  "frac-mul": fracMul,
  "frac-dec-pct": fracDecPct,
  "pct-of": pctOf,
  "pct-change": pctChange,
};
