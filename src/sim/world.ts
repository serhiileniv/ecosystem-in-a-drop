import { Rng } from '../core/rng';
import { Grid } from '../core/grid';
import { CFG, NT, TR, type SpeciesCfg } from './config';
import { NIN, NHID, NOUT, NW, SECTORS, forward, randomBrain, inherit } from './brain';

export const KIND = { PLANT: 0, HERB: 1, PRED: 2 } as const;

/** Struct-of-arrays population of brain-carrying creatures. */
export interface Pop {
  cfg: SpeciesCfg;
  cap: number;
  n: number;
  x: Float32Array;
  y: Float32Array;
  ang: Float32Array;
  spd: Float32Array;
  energy: Float32Array;
  emax: Float32Array;
  struct: Float32Array;
  age: Float32Array;
  maxAge: Float32Array;
  cool: Float32Array;
  feed: Float32Array;
  fed: Float32Array;
  /** heritable lineage marker in [0,1); clan identity for herd defence */
  tag: Float32Array;
  T: Float32Array; // cap * NT heritable traits
  W: Float32Array; // cap * NW network weights
  uid: Int32Array;
  gen: Int32Array;
  kids: Int32Array;
  dead: Uint8Array;
}

export interface Plants {
  cap: number;
  n: number;
  x: Float32Array;
  y: Float32Array;
  e: Float32Array;
  dead: Uint8Array;
}

function makePop(cfg: SpeciesCfg, cap: number): Pop {
  return {
    cfg,
    cap,
    n: 0,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    ang: new Float32Array(cap),
    spd: new Float32Array(cap),
    energy: new Float32Array(cap),
    emax: new Float32Array(cap),
    struct: new Float32Array(cap),
    age: new Float32Array(cap),
    maxAge: new Float32Array(cap),
    cool: new Float32Array(cap),
    feed: new Float32Array(cap),
    fed: new Float32Array(cap),
    tag: new Float32Array(cap),
    T: new Float32Array(cap * NT),
    W: new Float32Array(cap * NW),
    uid: new Int32Array(cap),
    gen: new Int32Array(cap),
    kids: new Int32Array(cap),
    dead: new Uint8Array(cap),
  };
}

/** Move creature `src` into slot `dst` (used by the end-of-tick compaction). */
function moveSlot(p: Pop, dst: number, src: number): void {
  p.x[dst] = p.x[src];
  p.y[dst] = p.y[src];
  p.ang[dst] = p.ang[src];
  p.spd[dst] = p.spd[src];
  p.energy[dst] = p.energy[src];
  p.emax[dst] = p.emax[src];
  p.struct[dst] = p.struct[src];
  p.age[dst] = p.age[src];
  p.maxAge[dst] = p.maxAge[src];
  p.cool[dst] = p.cool[src];
  p.feed[dst] = p.feed[src];
  p.fed[dst] = p.fed[src];
  p.tag[dst] = p.tag[src];
  p.uid[dst] = p.uid[src];
  p.gen[dst] = p.gen[src];
  p.kids[dst] = p.kids[src];
  p.dead[dst] = p.dead[src];
  p.T.copyWithin(dst * NT, src * NT, src * NT + NT);
  p.W.copyWithin(dst * NW, src * NW, src * NW + NW);
}

function compact(p: Pop): void {
  let n = p.n;
  let i = 0;
  while (i < n) {
    if (p.dead[i]) {
      n--;
      if (i !== n) moveSlot(p, i, n);
    } else i++;
  }
  p.n = n;
}

export interface Sample {
  t: number;
  plants: number;
  herb: number;
  pred: number;
  soil: number;
  biomass: number;
  hTraits: Float32Array;
  pTraits: Float32Array;
  hGen: number;
  pGen: number;
  hEnergy: number;
  pEnergy: number;
  /** mean nearest-neighbour distance / the value expected if placement were random.
   *  < 1 = herds, ~1 = random, > 1 = spaced out */
  group: number;
  /** Simpson effective number of distinct clan markers among herbivores */
  clans: number;
}

export interface Counters {
  bornH: number;
  bornP: number;
  starvedH: number;
  starvedP: number;
  agedH: number;
  agedP: number;
  eaten: number;
  grazed: number;
  /** attacks broken off because the target's clan-mates were present */
  defended: number;
  /** predators eaten by larger predators */
  cannibal: number;
  /** energy burned in dominance contests between comparable rivals */
  contest: number;
}

export class World {
  rng: Rng;
  t = 0;
  ticks = 0;
  soil = 0;
  plants: Plants;
  herb: Pop;
  pred: Pop;
  gPlant: Grid;
  gHerb: Grid;
  gPred: Grid;
  counters: Counters = {
    bornH: 0, bornP: 0, starvedH: 0, starvedP: 0, agedH: 0, agedP: 0,
    eaten: 0, grazed: 0, defended: 0, cannibal: 0, contest: 0,
  };
  seed: number;

  private nextUid = 1;
  private seedAcc = 0;
  private inp = new Float32Array(NIN);
  private hid = new Float32Array(NHID);
  private out = new Float32Array(NOUT);
  private rnd = () => this.rng.f();
  private gauss = () => this.rng.gauss();
  /** last network I/O of the inspected creature, filled during its update */
  lastInp = new Float32Array(NIN);
  lastHid = new Float32Array(NHID);
  lastOut = new Float32Array(NOUT);
  watchKind = -1;
  watchIndex = -1;

  constructor(seed = CFG.seed) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.plants = {
      cap: CFG.plant.cap,
      n: 0,
      x: new Float32Array(CFG.plant.cap),
      y: new Float32Array(CFG.plant.cap),
      e: new Float32Array(CFG.plant.cap),
      dead: new Uint8Array(CFG.plant.cap),
    };
    this.herb = makePop(CFG.herb, CFG.caps.herb);
    this.pred = makePop(CFG.pred, CFG.caps.pred);
    const R = CFG.world.radius;
    this.gPlant = new Grid(-R, -R, 2 * R, 40, CFG.plant.cap);
    this.gHerb = new Grid(-R, -R, 2 * R, 60, CFG.caps.herb);
    this.gPred = new Grid(-R, -R, 2 * R, 60, CFG.caps.pred);
    this.reset(seed);
  }

  reset(seed = this.seed): void {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.t = 0;
    this.ticks = 0;
    this.nextUid = 1;
    this.seedAcc = 0;
    this.plants.n = 0;
    this.herb.n = 0;
    this.pred.n = 0;
    this.plants.dead.fill(0);
    this.herb.dead.fill(0);
    this.pred.dead.fill(0);
    for (const k of Object.keys(this.counters) as (keyof Counters)[]) this.counters[k] = 0;
    this.soil = CFG.world.totalEnergy;

    const p = { x: 0, y: 0 };
    const R = CFG.world.radius;
    for (let i = 0; i < CFG.start.plants; i++) {
      this.rng.inDisc(R * 0.95, p);
      this.addPlant(p.x, p.y, CFG.plant.maxEnergy * this.rng.range(0.3, 1));
    }
    for (let i = 0; i < CFG.start.herb; i++) {
      this.rng.inDisc(R * 0.9, p);
      this.birth(this.herb, p.x, p.y, -1);
    }
    for (let i = 0; i < CFG.start.pred; i++) {
      this.rng.inDisc(R * 0.9, p);
      this.birth(this.pred, p.x, p.y, -1);
    }
  }

  // ---------------------------------------------------------------- spawning

  private addPlant(x: number, y: number, e: number): boolean {
    const P = this.plants;
    if (P.n >= P.cap) return false;
    const take = Math.min(e, this.soil);
    if (take <= 0) return false;
    const i = P.n++;
    P.x[i] = x;
    P.y[i] = y;
    P.e[i] = take;
    P.dead[i] = 0;
    this.soil -= take;
    return true;
  }

  /**
   * Create a creature. `parent >= 0` inherits (with mutation) from that slot and
   * splits its energy; `parent < 0` creates a random founder funded by the soil.
   */
  birth(p: Pop, x: number, y: number, parent: number): number {
    if (p.n >= p.cap) return -1;
    const i = p.n++;
    const c = p.cfg;
    const tb = i * NT;
    const rad = CFG.env.radiation;

    if (parent < 0) {
      for (let k = 0; k < NT; k++) {
        const d = c.traits[k];
        // founders start spread around the nominal value so selection has material
        p.T[tb + k] = clamp(d.init + this.rng.gauss() * d.step * (d.max - d.min) * 2, d.min, d.max);
      }
      randomBrain(p.W, i * NW, this.rnd);
      p.tag[i] = this.rng.f();
      p.gen[i] = 0;
    } else {
      const pb = parent * NT;
      for (let k = 0; k < NT; k++) {
        const d = c.traits[k];
        const v = p.T[pb + k] + this.rng.gauss() * d.step * (d.max - d.min) * rad;
        p.T[tb + k] = clamp(v, d.min, d.max);
      }
      inherit(p.W, parent * NW, i * NW, CFG.mut.rate * rad, CFG.mut.sigma * rad, this.rnd, this.gauss);
      // the clan marker drifts slowly and is under no direct selection of its own
      let tg = p.tag[parent] + this.rng.gauss() * c.tagMut * rad;
      tg -= Math.floor(tg);
      p.tag[i] = tg;
      p.gen[i] = p.gen[parent] + 1;
    }

    const size = p.T[tb + TR.SIZE];
    p.x[i] = x;
    p.y[i] = y;
    p.ang[i] = this.rng.f() * 6.283185307179586;
    p.spd[i] = 0;
    p.emax[i] = c.maxEnergyPerSize * size;
    p.struct[i] = c.structPerSize * size;
    p.age[i] = 0;
    p.maxAge[i] = Math.max(20, c.maxAge * (1 + this.rng.gauss() * c.ageSpread));
    p.cool[i] = c.cooldown;
    p.feed[i] = 0;
    p.fed[i] = 0;
    p.kids[i] = 0;
    p.uid[i] = this.nextUid++;
    p.dead[i] = 0;

    if (parent < 0) {
      const want = p.emax[i] * c.startEnergyFrac + p.struct[i];
      const take = Math.min(want, this.soil);
      p.energy[i] = Math.max(0, take - p.struct[i]);
      p.struct[i] = Math.min(p.struct[i], take);
      this.soil -= take;
    } else {
      p.energy[i] = 0; // filled in by the caller from the parent's split
    }
    return i;
  }

  // ------------------------------------------------------------------- step

  step(dt = CFG.dt): void {
    const R = CFG.world.radius;
    this.gPlant.build(this.plants.x, this.plants.y, this.plants.n);
    this.gHerb.build(this.herb.x, this.herb.y, this.herb.n);
    this.gPred.build(this.pred.x, this.pred.y, this.pred.n);

    this.stepPlants(dt, R);
    this.stepCreatures(this.herb, true, dt, R);
    this.stepCreatures(this.pred, false, dt, R);

    compactPlants(this.plants);
    compact(this.herb);
    compact(this.pred);

    this.t += dt;
    this.ticks++;
  }

  private stepPlants(dt: number, R: number): void {
    const P = this.plants;
    const c = CFG.plant;
    // Monod-limited uptake: growth saturates as the soil pool fills up
    const avail = (this.soil / (this.soil + c.soilHalf)) * CFG.env.drought;
    const grow = c.grow * avail * dt;
    if (grow > 0) {
      for (let i = 0; i < P.n; i++) {
        const room = c.maxEnergy - P.e[i];
        if (room <= 0) continue;
        const take = Math.min(grow, room, this.soil);
        if (take <= 0) break;
        P.e[i] += take;
        this.soil -= take;
      }
    }
    this.seedAcc += c.seedRate * avail * dt;
    const pt = { x: 0, y: 0 };
    while (this.seedAcc >= 1) {
      this.seedAcc -= 1;
      if (P.n >= P.cap || this.soil < c.seedCost) break;
      let x: number, y: number;
      if (P.n > 0 && this.rng.f() < c.clusterP) {
        const j = this.rng.int(P.n);
        x = P.x[j] + this.rng.gauss() * c.clusterSigma;
        y = P.y[j] + this.rng.gauss() * c.clusterSigma;
        const d = Math.hypot(x, y);
        if (d > R * 0.98) {
          x *= (R * 0.98) / d;
          y *= (R * 0.98) / d;
        }
      } else {
        this.rng.inDisc(R * 0.97, pt);
        x = pt.x;
        y = pt.y;
      }
      // self-thinning: seeds fail in already occupied ground
      if (nearest(this.gPlant, P.x, P.y, P.dead, x, y, c.spacing, -1) >= 0) continue;
      this.addPlant(x, y, c.seedCost);
    }
  }

  private stepCreatures(p: Pop, isHerb: boolean, dt: number, R: number): void {
    const c = p.cfg;
    const inp = this.inp;
    const hid = this.hid;
    const out = this.out;
    const n0 = p.n;
    const kind = isHerb ? KIND.HERB : KIND.PRED;

    for (let i = 0; i < n0; i++) {
      if (p.dead[i]) continue;
      const tb = i * NT;
      const spdMax = p.T[tb + TR.SPEED];
      const size = p.T[tb + TR.SIZE];
      const sense = p.T[tb + TR.SENSE];
      const digest = p.T[tb + TR.DIGEST];
      const reproT = p.T[tb + TR.REPRO];
      const x = p.x[i];
      const y = p.y[i];
      const ang = p.ang[i];

      // ---- senses
      this.senseInto(p, i, isHerb, inp);
      forward(p.W, i * NW, inp, hid, out);
      if (kind === this.watchKind && i === this.watchIndex) {
        this.lastInp.set(inp);
        this.lastHid.set(hid);
        this.lastOut.set(out);
      }

      // ---- locomotion (bigger bodies turn slower)
      const na = ang + out[1] * (c.turnRate / size) * dt;
      const target = (out[0] * 0.5 + 0.5) * spdMax;
      let spd = p.spd[i];
      spd += (target - spd) * Math.min(1, c.accel * dt);
      let nx = x + Math.cos(na) * spd * dt;
      let ny = y + Math.sin(na) * spd * dt;
      let ang2 = na;
      const d = Math.hypot(nx, ny);
      const lim = R - 4 * size;
      if (d > lim) {
        nx *= lim / d;
        ny *= lim / d;
        ang2 = Math.atan2(-ny, -nx) + this.rng.range(-0.6, 0.6); // bounce inward
        spd *= 0.4;
      }
      p.x[i] = nx;
      p.y[i] = ny;
      p.ang[i] = ang2;
      p.spd[i] = spd;

      // ---- feeding
      const reach = c.eatReach * size;
      if (p.feed[i] > 0) {
        p.feed[i] -= dt;
      } else if (isHerb) {
        const j = nearest(this.gPlant, this.plants.x, this.plants.y, this.plants.dead, nx, ny, reach + 2, -1);
        if (j >= 0) {
          const meal = this.plants.e[j];
          const gain = meal * digest;
          const room = p.emax[i] - p.energy[i];
          const got = Math.min(gain, room);
          p.energy[i] += got;
          p.fed[i] += got;
          this.soil += meal - got;
          this.plants.dead[j] = 1;
          p.feed[i] = c.feedCd;
          this.counters.grazed++;
        }
      } else {
        // gape limitation: a predator can only swallow prey below size/gape
        const j = nearest(
          this.gHerb, this.herb.x, this.herb.y, this.herb.dead, nx, ny, reach + 2, -1,
          this.herb.T, size / c.gape,
        );
        if (j >= 0) {
          // herd defence: clan-mates standing around the target deter the attacker,
          // with saturating returns and less effect on a large predator
          const hc = this.herb.cfg;
          const guards = countClan(
            this.gHerb, this.herb, this.herb.x[j], this.herb.y[j],
            hc.defR, this.herb.tag[j], hc.clanWidth, j,
          );
          // deterrence grows from the very first neighbour, so selection has a
          // gradient to climb, and saturates so a herd is not invulnerable
          const deter = guards > 0 ? (hc.defK * Math.pow(guards, hc.defExp)) / size : 0;
          if (deter > 0 && this.rng.f() < deter / (1 + deter)) {
            const pay = Math.min(c.failCost, p.energy[i]);
            p.energy[i] -= pay;
            this.soil += pay;
            p.feed[i] = c.feedCd * 0.4;
            this.counters.defended++;
          } else {
            this.consume(p, i, this.herb, j, digest);
            p.feed[i] = c.feedCd;
            this.counters.eaten++;
          }
        } else {
          // intraguild predation: a clearly larger predator eats a smaller rival
          const k = nearest(
            this.gPred, this.pred.x, this.pred.y, this.pred.dead, nx, ny, reach + 2, i,
            this.pred.T, size / c.gapeIG,
          );
          if (k >= 0) {
            this.consume(p, i, this.pred, k, digest);
            p.feed[i] = c.feedCd;
            this.counters.cannibal++;
          }
        }
      }

      // ---- interference competition: rivals too close in size to eat each other
      // still cost each other energy in dominance contests
      if (!isHerb && c.contestCost > 0) {
        const rivals = countRivals(this.gPred, this.pred, nx, ny, c.contestR, size, c.gapeIG, i);
        if (rivals > 0) {
          const pay = Math.min(c.contestCost * rivals * dt, p.energy[i]);
          p.energy[i] -= pay;
          this.soil += pay;
          this.counters.contest += pay;
        }
      }

      // ---- metabolism: everything burned returns to the soil (closed system)
      const v = spd / c.refSpeed;
      const burn =
        (c.base * (0.4 + 0.6 * size * size) +
          c.moveCost * v * v * size +
          c.senseCost * sense +
          c.digestCost * digest) *
        CFG.env.metabolism *
        dt;
      const paid = Math.min(burn, p.energy[i]);
      p.energy[i] -= paid;
      this.soil += paid;
      p.age[i] += dt;
      if (p.cool[i] > 0) p.cool[i] -= dt;

      // ---- death
      if (p.energy[i] <= 1e-6) {
        p.dead[i] = 1;
        this.soil += p.struct[i];
        if (isHerb) this.counters.starvedH++;
        else this.counters.starvedP++;
        continue;
      }
      if (p.age[i] > p.maxAge[i]) {
        p.dead[i] = 1;
        this.soil += p.energy[i] + p.struct[i];
        if (isHerb) this.counters.agedH++;
        else this.counters.agedP++;
        continue;
      }

      // ---- division
      // Offspring are provisioned with a fixed share of their own capacity, so a
      // newborn is always viable; only the parent takes the risk of dividing early.
      const minPay = (c.childFrac * p.emax[i] + c.structPerSize * size) * (1 + c.reproWaste);
      if (
        out[2] > 0 &&
        p.cool[i] <= 0 &&
        p.energy[i] >= reproT * p.emax[i] &&
        p.energy[i] > minPay &&
        p.n < p.cap
      ) {
        const jitter = this.rng.range(0, 6.283185307179586);
        const ch = this.birth(
          p,
          nx + Math.cos(jitter) * size * 3,
          ny + Math.sin(jitter) * size * 3,
          i,
        );
        if (ch >= 0) {
          const pay = (c.childFrac * p.emax[ch] + p.struct[ch]) * (1 + c.reproWaste);
          const give = pay / (1 + c.reproWaste) - p.struct[ch];
          p.energy[i] -= pay;
          p.energy[ch] = give;
          this.soil += pay - give - p.struct[ch];
          p.cool[i] = c.cooldown;
          p.kids[i]++;
          if (isHerb) this.counters.bornH++;
          else this.counters.bornP++;
        }
      }
    }
  }

  /** Move a victim's whole body into the eater, the remainder into the soil. */
  private consume(p: Pop, i: number, prey: Pop, j: number, digest: number): void {
    const meal = prey.energy[j] + prey.struct[j];
    const room = p.emax[i] - p.energy[i];
    const got = Math.min(meal * digest, room);
    p.energy[i] += got;
    p.fed[i] += got;
    this.soil += meal - got;
    prey.dead[j] = 1;
  }

  /**
   * Fill `inp` with the creature's 18 sensory values. Channels are relative to
   * the species: herbivores see plants / herbivores / predators, predators see
   * herbivores / predators / plants.
   */
  senseInto(p: Pop, i: number, isHerb: boolean, inp: Float32Array): void {
    const tb = i * NT;
    const sense = p.T[tb + TR.SENSE];
    const fov = p.T[tb + TR.FOV];
    const x = p.x[i];
    const y = p.y[i];
    const ca = Math.cos(p.ang[i]);
    const sa = Math.sin(p.ang[i]);
    const foodGrid = isHerb ? this.gPlant : this.gHerb;
    const foodX = isHerb ? this.plants.x : this.herb.x;
    const foodY = isHerb ? this.plants.y : this.herb.y;
    const foodDead = isHerb ? this.plants.dead : this.herb.dead;
    const kinGrid = isHerb ? this.gHerb : this.gPred;
    const otherGrid = isHerb ? this.gPred : this.gPlant;
    const otherX = isHerb ? this.pred.x : this.plants.x;
    const otherY = isHerb ? this.pred.y : this.plants.y;
    const otherDead = isHerb ? this.pred.dead : this.plants.dead;

    inp.fill(0);
    scan(foodGrid, foodX, foodY, foodDead, x, y, ca, sa, sense, fov, inp, 0, -1);
    const kin = scan(kinGrid, p.x, p.y, p.dead, x, y, ca, sa, sense, fov, inp, SECTORS, i);
    scan(otherGrid, otherX, otherY, otherDead, x, y, ca, sa, sense, fov, inp, 2 * SECTORS, -1);
    inp[15] = p.energy[i] / p.emax[i];
    inp[16] = Math.min(1, kin / 10);
    inp[17] = 1;
  }

  /** Recompute (without side effects) the network I/O of one creature, for the inspector. */
  observe(kind: number, i: number): void {
    const p = kind === KIND.PRED ? this.pred : this.herb;
    if (i < 0 || i >= p.n) return;
    this.senseInto(p, i, kind === KIND.HERB, this.lastInp);
    forward(p.W, i * NW, this.lastInp, this.lastHid, this.lastOut);
  }

  // ---------------------------------------------------------------- readouts

  /** Total energy in the dish. Must stay constant - the model is closed. */
  audit(): number {
    let e = this.soil;
    for (let i = 0; i < this.plants.n; i++) e += this.plants.e[i];
    for (let i = 0; i < this.herb.n; i++) e += this.herb.energy[i] + this.herb.struct[i];
    for (let i = 0; i < this.pred.n; i++) e += this.pred.energy[i] + this.pred.struct[i];
    return e;
  }

  meanTraits(p: Pop, out: Float32Array): Float32Array {
    out.fill(0);
    if (p.n === 0) return out;
    for (let i = 0; i < p.n; i++) {
      const b = i * NT;
      for (let k = 0; k < NT; k++) out[k] += p.T[b + k];
    }
    for (let k = 0; k < NT; k++) out[k] /= p.n;
    return out;
  }

  sample(): Sample {
    let biomass = 0;
    for (let i = 0; i < this.plants.n; i++) biomass += this.plants.e[i];
    let he = 0;
    for (let i = 0; i < this.herb.n; i++) he += this.herb.energy[i];
    let pe = 0;
    for (let i = 0; i < this.pred.n; i++) pe += this.pred.energy[i];
    let hg = 0;
    for (let i = 0; i < this.herb.n; i++) hg += this.herb.gen[i];
    let pg = 0;
    for (let i = 0; i < this.pred.n; i++) pg += this.pred.gen[i];
    return {
      t: this.t,
      plants: this.plants.n,
      herb: this.herb.n,
      pred: this.pred.n,
      soil: this.soil,
      biomass,
      hTraits: this.meanTraits(this.herb, new Float32Array(NT)),
      pTraits: this.meanTraits(this.pred, new Float32Array(NT)),
      hGen: this.herb.n ? hg / this.herb.n : 0,
      pGen: this.pred.n ? pg / this.pred.n : 0,
      hEnergy: he,
      pEnergy: pe,
      group: this.grouping(this.herb, this.gHerb),
      clans: this.clanDiversity(this.herb),
    };
  }

  /**
   * Clark-Evans style aggregation index: observed mean nearest-neighbour distance
   * divided by the mean expected for the same density under complete spatial
   * randomness (0.5/sqrt(density)). Below 1 means the population is clumped.
   */
  grouping(p: Pop, g: Grid): number {
    if (p.n < 12) return 1;
    const area = Math.PI * CFG.world.radius * CFG.world.radius;
    const expected = 0.5 / Math.sqrt(p.n / area);
    const cap = 160;
    const stride = Math.max(1, Math.floor(p.n / 300));
    let sum = 0;
    let m = 0;
    for (let i = 0; i < p.n; i += stride) {
      const j = nearest(g, p.x, p.y, p.dead, p.x[i], p.y[i], cap, i);
      sum += j >= 0 ? Math.hypot(p.x[j] - p.x[i], p.y[j] - p.y[i]) : cap;
      m++;
    }
    return m ? sum / m / expected : 1;
  }

  /** Effective number of clan markers (inverse Simpson index over 20 bins). */
  clanDiversity(p: Pop): number {
    if (p.n === 0) return 0;
    const bins = new Float64Array(20);
    for (let i = 0; i < p.n; i++) {
      let b = (p.tag[i] * 20) | 0;
      if (b > 19) b = 19;
      else if (b < 0) b = 0;
      bins[b]++;
    }
    let acc = 0;
    for (let b = 0; b < 20; b++) {
      const f = bins[b] / p.n;
      acc += f * f;
    }
    return acc > 0 ? 1 / acc : 0;
  }

  /** Index of the creature nearest to (x,y) within r, or -1. */
  pick(x: number, y: number, r: number): { kind: number; index: number } {
    const h = nearest(this.gHerb, this.herb.x, this.herb.y, this.herb.dead, x, y, r, -1);
    const pr = nearest(this.gPred, this.pred.x, this.pred.y, this.pred.dead, x, y, r, -1);
    if (pr >= 0 && h >= 0) {
      const dp = (this.pred.x[pr] - x) ** 2 + (this.pred.y[pr] - y) ** 2;
      const dh = (this.herb.x[h] - x) ** 2 + (this.herb.y[h] - y) ** 2;
      return dp < dh ? { kind: KIND.PRED, index: pr } : { kind: KIND.HERB, index: h };
    }
    if (pr >= 0) return { kind: KIND.PRED, index: pr };
    if (h >= 0) return { kind: KIND.HERB, index: h };
    return { kind: -1, index: -1 };
  }

  indexOfUid(kind: number, uid: number): number {
    const p = kind === KIND.PRED ? this.pred : this.herb;
    for (let i = 0; i < p.n; i++) if (p.uid[i] === uid) return i;
    return -1;
  }

  // ----------------------------------------------------------- perturbations

  /** Kill a fraction of a population at random (bodies return to the soil). */
  cull(kind: number, frac: number): void {
    const p = kind === KIND.PRED ? this.pred : this.herb;
    for (let i = 0; i < p.n; i++) {
      if (this.rng.f() < frac) {
        p.dead[i] = 1;
        this.soil += p.energy[i] + p.struct[i];
      }
    }
    compact(p);
  }

  /** Drop in `k` fresh random-brained founders of a species. */
  inject(kind: number, k: number): void {
    const p = kind === KIND.PRED ? this.pred : this.herb;
    const pt = { x: 0, y: 0 };
    for (let i = 0; i < k; i++) {
      this.rng.inDisc(CFG.world.radius * 0.9, pt);
      this.birth(p, pt.x, pt.y, -1);
    }
  }

  /** Remove a fraction of the standing vegetation ("fire"). */
  burnPlants(frac: number): void {
    const P = this.plants;
    for (let i = 0; i < P.n; i++) {
      if (this.rng.f() < frac) {
        this.soil += P.e[i];
        P.dead[i] = 1;
      }
    }
    compactPlants(P);
  }
}

// -------------------------------------------------------------------- helpers

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function compactPlants(P: Plants): void {
  let n = P.n;
  let i = 0;
  while (i < n) {
    if (P.dead[i]) {
      n--;
      if (i !== n) {
        P.x[i] = P.x[n];
        P.y[i] = P.y[n];
        P.e[i] = P.e[n];
        P.dead[i] = P.dead[n];
      }
    } else i++;
  }
  P.n = n;
}

/**
 * Write the nearest-object intensity per vision sector for one channel.
 * Returns how many objects fell inside the cone (used as a crowding cue).
 */
function scan(
  g: Grid,
  xs: Float32Array,
  ys: Float32Array,
  dead: Uint8Array,
  px: number,
  py: number,
  ca: number,
  sa: number,
  range: number,
  fov: number,
  inp: Float32Array,
  chOff: number,
  self: number,
): number {
  const half = fov * 0.5;
  const r2 = range * range;
  const c0 = g.cx(px - range);
  const c1 = g.cx(px + range);
  const r0 = g.cy(py - range);
  const r1 = g.cy(py + range);
  let seen = 0;
  for (let ry = r0; ry <= r1; ry++) {
    const row = ry * g.cols;
    for (let cx = c0; cx <= c1; cx++) {
      const cell = row + cx;
      const s = g.start[cell];
      const e = s + g.count[cell];
      for (let k = s; k < e; k++) {
        const j = g.order[k];
        if (j === self || dead[j]) continue;
        const dx = xs[j] - px;
        const dy = ys[j] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const lx = dx * ca + dy * sa;
        const ly = -dx * sa + dy * ca;
        const a = Math.atan2(ly, lx);
        if (a < -half || a > half) continue;
        seen++;
        let sec = (((a + half) / fov) * SECTORS) | 0;
        if (sec < 0) sec = 0;
        else if (sec >= SECTORS) sec = SECTORS - 1;
        const v = 1 - Math.sqrt(d2) / range;
        const idx = chOff + sec;
        if (v > inp[idx]) inp[idx] = v;
      }
    }
  }
  return seen;
}

/** Nearest live object of a population within radius r, or -1. */
function nearest(
  g: Grid,
  xs: Float32Array,
  ys: Float32Array,
  dead: Uint8Array,
  px: number,
  py: number,
  r: number,
  self: number,
  sizeOf: Float32Array | null = null,
  maxSize = 0,
): number {
  const r2 = r * r;
  let best = -1;
  let bd = r2;
  const c0 = g.cx(px - r);
  const c1 = g.cx(px + r);
  const r0 = g.cy(py - r);
  const r1 = g.cy(py + r);
  for (let ry = r0; ry <= r1; ry++) {
    const row = ry * g.cols;
    for (let cx = c0; cx <= c1; cx++) {
      const cell = row + cx;
      const s = g.start[cell];
      const e = s + g.count[cell];
      for (let k = s; k < e; k++) {
        const j = g.order[k];
        if (j === self || dead[j]) continue;
        if (sizeOf !== null && sizeOf[j * NT + TR.SIZE] > maxSize) continue;
        const dx = xs[j] - px;
        const dy = ys[j] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = j;
        }
      }
    }
  }
  return best;
}

/** How many clan-mates of `tag` stand within r of (px,py). */
function countClan(
  g: Grid,
  p: Pop,
  px: number,
  py: number,
  r: number,
  tag: number,
  width: number,
  self: number,
): number {
  const r2 = r * r;
  let n = 0;
  const c0 = g.cx(px - r);
  const c1 = g.cx(px + r);
  const r0 = g.cy(py - r);
  const r1 = g.cy(py + r);
  for (let ry = r0; ry <= r1; ry++) {
    const row = ry * g.cols;
    for (let cx = c0; cx <= c1; cx++) {
      const cell = row + cx;
      const s = g.start[cell];
      const e = s + g.count[cell];
      for (let k = s; k < e; k++) {
        const j = g.order[k];
        if (j === self || p.dead[j]) continue;
        const dx = p.x[j] - px;
        const dy = p.y[j] - py;
        if (dx * dx + dy * dy > r2) continue;
        let d = Math.abs(p.tag[j] - tag);
        if (d > 0.5) d = 1 - d; // the marker is circular
        if (d < width) n++;
      }
    }
  }
  return n;
}

/** How many rivals within r are too close in size for either to eat the other. */
function countRivals(
  g: Grid,
  p: Pop,
  px: number,
  py: number,
  r: number,
  size: number,
  gapeIG: number,
  self: number,
): number {
  const r2 = r * r;
  const lo = size / gapeIG;
  const hi = size * gapeIG;
  let n = 0;
  const c0 = g.cx(px - r);
  const c1 = g.cx(px + r);
  const r0 = g.cy(py - r);
  const r1 = g.cy(py + r);
  for (let ry = r0; ry <= r1; ry++) {
    const row = ry * g.cols;
    for (let cx = c0; cx <= c1; cx++) {
      const cell = row + cx;
      const s = g.start[cell];
      const e = s + g.count[cell];
      for (let k = s; k < e; k++) {
        const j = g.order[k];
        if (j === self || p.dead[j]) continue;
        const sz = p.T[j * NT + TR.SIZE];
        if (sz < lo || sz > hi) continue;
        const dx = p.x[j] - px;
        const dy = p.y[j] - py;
        if (dx * dx + dy * dy > r2) continue;
        n++;
      }
    }
  }
  return n;
}
