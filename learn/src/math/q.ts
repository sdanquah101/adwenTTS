/** Exact rational numbers, so answers like 7/3 are never rounded. */
export class Q {
  readonly n: number;
  readonly d: number;

  constructor(n: number, d = 1) {
    if (!Number.isInteger(n) || !Number.isInteger(d))
      throw new Error(`Q needs integers, got ${n}/${d}`);
    if (d === 0) throw new Error("Q denominator is zero");
    const sign = d < 0 ? -1 : 1;
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    this.n = (sign * n) / g;
    this.d = Math.abs(d) / g;
  }

  add(o: Q | number): Q {
    const b = q(o);
    return new Q(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  sub(o: Q | number): Q {
    const b = q(o);
    return new Q(this.n * b.d - b.n * this.d, this.d * b.d);
  }
  mul(o: Q | number): Q {
    const b = q(o);
    return new Q(this.n * b.n, this.d * b.d);
  }
  div(o: Q | number): Q {
    const b = q(o);
    if (b.n === 0) throw new Error("division by zero");
    return new Q(this.n * b.d, this.d * b.n);
  }
  neg(): Q {
    return new Q(-this.n, this.d);
  }
  eq(o: Q | number): boolean {
    const b = q(o);
    return this.n === b.n && this.d === b.d;
  }
  isInt(): boolean {
    return this.d === 1;
  }
  /** Canonical key used to compare answers: "7", "-7/3". */
  key(): string {
    return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`;
  }
  valueOf(): number {
    return this.n / this.d;
  }
}

export function q(x: Q | number): Q {
  return x instanceof Q ? x : new Q(x);
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
