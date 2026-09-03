/**
 * Deterministic PRNG (mulberry32). Every experiment is reproducible from a seed:
 * same seed + same parameters + same tick count => bit-identical run.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** uniform [0,1) */
  f(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** uniform [a,b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.f();
  }

  /** uniform integer [0,n) */
  int(n: number): number {
    return (this.f() * n) | 0;
  }

  /** standard normal, Box-Muller (single value, second discarded for simplicity) */
  gauss(): number {
    let u = this.f();
    if (u < 1e-12) u = 1e-12;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * this.f());
  }

  /** uniform point inside a disc of radius r centred on origin */
  inDisc(r: number, out: { x: number; y: number }): void {
    const a = this.f() * 6.283185307179586;
    const d = r * Math.sqrt(this.f());
    out.x = Math.cos(a) * d;
    out.y = Math.sin(a) * d;
  }

  state(): number {
    return this.s;
  }
}
