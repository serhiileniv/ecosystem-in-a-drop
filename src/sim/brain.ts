/**
 * Tiny fixed-topology MLP, one per creature.
 *
 *   23 inputs -> 8 hidden (tanh) -> 4 outputs (tanh)
 *
 * Inputs (see world.ts::senseInto):
 *   0..4    channel 0 ("food")   per vision sector, 1 = touching, 0 = nothing
 *   5..9    channel 1 ("kin")    per vision sector - same-species presence
 *   10..14  channel 2 ("risk")   per vision sector
 *   15..19  channel 3 ("mate")   per vision sector - same-species presence,
 *           weighted by how strongly that individual is currently displaying
 *           (0 unless the other creature is both receptive and courting)
 *   20      normalised energy
 *   21      local crowding of own species
 *   22      constant bias 1
 *
 * Outputs:
 *   0  thrust      (-1..1 -> 0..maxSpeed)
 *   1  turn        (-1..1 -> +-turnRate)
 *   2  ready        (>0 = willing to reproduce: accepts a mate this tick, or
 *                    after a period spent unable to find one, divides alone)
 *   3  court        (>0 = spend energy broadcasting the ornament trait so
 *                    others' "mate" channel can see it - a costly signal)
 *
 * All weights of every creature live in one flat Float32Array owned by the
 * population; `off` is the creature's base index.
 */
export const SECTORS = 5;
export const NIN = 23;
export const NHID = 8;
export const NOUT = 4;

export const W1 = 0; //            NIN*NHID
export const B1 = NIN * NHID; //   NHID
export const W2 = B1 + NHID; //    NHID*NOUT
export const B2 = W2 + NHID * NOUT; // NOUT
export const NW = B2 + NOUT;

export function randomBrain(W: Float32Array, off: number, rnd: () => number): void {
  for (let i = 0; i < NW; i++) W[off + i] = (rnd() * 2 - 1) * 0.8;
}

export function forward(
  W: Float32Array,
  off: number,
  inp: Float32Array,
  hid: Float32Array,
  out: Float32Array,
): void {
  for (let h = 0; h < NHID; h++) {
    let s = W[off + B1 + h];
    const r = off + W1 + h * NIN;
    for (let i = 0; i < NIN; i++) s += W[r + i] * inp[i];
    hid[h] = Math.tanh(s);
  }
  for (let o = 0; o < NOUT; o++) {
    let s = W[off + B2 + o];
    const r = off + W2 + o * NHID;
    for (let h = 0; h < NHID; h++) s += W[r + h] * hid[h];
    out[o] = Math.tanh(s);
  }
}

/**
 * Copy a parent brain into a child slot, perturbing a fraction of the weights.
 * `rate` is the per-weight mutation probability, `sigma` the gaussian step.
 */
export function inherit(
  W: Float32Array,
  src: number,
  dst: number,
  rate: number,
  sigma: number,
  rnd: () => number,
  gauss: () => number,
): void {
  for (let i = 0; i < NW; i++) {
    let v = W[src + i];
    if (rnd() < rate) v += gauss() * sigma;
    if (v > 4) v = 4;
    else if (v < -4) v = -4;
    W[dst + i] = v;
  }
}

/**
 * Sexual reproduction: uniform crossover of two parent brains into a child
 * slot (each weight independently inherited from one parent or the other),
 * then the same per-weight mutation as asexual inheritance. This is what
 * makes recombination possible - a child can combine a strength from each
 * parent that neither parent's single-parent clone ever could.
 */
export function inheritSexual(
  W: Float32Array,
  srcA: number,
  srcB: number,
  dst: number,
  rate: number,
  sigma: number,
  rnd: () => number,
  gauss: () => number,
): void {
  for (let i = 0; i < NW; i++) {
    let v = rnd() < 0.5 ? W[srcA + i] : W[srcB + i];
    if (rnd() < rate) v += gauss() * sigma;
    if (v > 4) v = 4;
    else if (v < -4) v = -4;
    W[dst + i] = v;
  }
}

/** Mean |w| - a crude proxy for how "opinionated" a brain is. */
export function brainNorm(W: Float32Array, off: number): number {
  let s = 0;
  for (let i = 0; i < NW; i++) s += Math.abs(W[off + i]);
  return s / NW;
}
