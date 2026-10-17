import { Q, q } from "./q";

export const MINUS = "−";

/** -7 -> "−7" (true minus sign reads better than a hyphen). */
export function fmtInt(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : `${n}`;
}

/** Rational for display: "5", "−7/3". */
export function fmtQ(x: Q | number): string {
  const v = q(x);
  if (v.isInt()) return fmtInt(v.n);
  return `${v.n < 0 ? MINUS : ""}${Math.abs(v.n)}/${v.d}`;
}

/** Number in brackets when negative, for use after an operator: "(−3)". */
export function paren(n: number): string {
  return n < 0 ? `(${fmtInt(n)})` : `${n}`;
}

/** Coefficient times a letter: 1x -> "x", -1x -> "−x". */
export function term(coef: number, v = "x", power = 1): string {
  const letter = power === 2 ? `${v}²` : v;
  if (coef === 1) return letter;
  if (coef === -1) return `${MINUS}${letter}`;
  return `${fmtInt(coef)}${letter}`;
}

/** a·x + b with correct signs: (3, -2) -> "3x − 2". */
export function linear(a: number, b: number, v = "x", power = 1): string {
  if (a === 0) return fmtInt(b);
  const head = term(a, v, power);
  if (b === 0) return head;
  return `${head} ${b < 0 ? MINUS : "+"} ${Math.abs(b)}`;
}

/** Joins signed parts: ["3x", -5, "2x"] style building for stems. */
export function signed(parts: { coef: number; v?: string }[]): string {
  return parts
    .map((p, i) => {
      const body = p.v ? term(Math.abs(p.coef), p.v) : `${Math.abs(p.coef)}`;
      if (i === 0) return p.coef < 0 ? `${MINUS}${body}` : body;
      return `${p.coef < 0 ? MINUS : "+"} ${body}`;
    })
    .join(" ");
}

/** x/4 shown as a fraction with a letter on top. */
export function over(top: string, bottom: number): string {
  return `${top}/${bottom}`;
}

/** Number of decimal places needed for an exact decimal, or null if it never ends. */
function decimalPlaces(v: Q): number | null {
  for (let k = 0; k <= 6; k++) if (10 ** k % v.d === 0) return k;
  return null;
}

/** Exact decimal ("0.375", "12.5"); falls back to a fraction when the decimal never ends. */
export function fmtDec(x: Q | number): string {
  const v = q(x);
  const k = decimalPlaces(v);
  if (k === null) return fmtQ(v);
  const scaled = Math.abs(v.n) * (10 ** k / v.d);
  let s = String(scaled);
  if (k > 0) {
    s = s.padStart(k + 1, "0");
    s = `${s.slice(0, -k)}.${s.slice(-k)}`.replace(/\.?0+$/, "");
  }
  return `${v.n < 0 ? MINUS : ""}${s}`;
}

export function fmtPct(x: Q | number): string {
  return `${fmtDec(x)}%`;
}

/** Fraction answers the BECE way: "11/12", "1 5/12" (mixed number), "3". */
export function fmtMixed(x: Q | number): string {
  const v = q(x);
  if (v.isInt()) return fmtInt(v.n);
  const sign = v.n < 0 ? MINUS : "";
  const n = Math.abs(v.n);
  const whole = Math.floor(n / v.d);
  const rest = n % v.d;
  return whole ? `${sign}${whole} ${rest}/${v.d}` : `${sign}${rest}/${v.d}`;
}

export function isTerminating(x: Q | number): boolean {
  return decimalPlaces(q(x)) !== null;
}
