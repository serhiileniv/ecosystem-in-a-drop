/**
 * Every tunable number of the model lives here. The object is mutated live by
 * the UI (env knobs) - the rest is captured at reset() so a run stays coherent.
 */

/** Heritable trait slots. Stored as one Float32Array per population, stride NT. */
export const TR = {
  SPEED: 0,
  SIZE: 1,
  SENSE: 2,
  FOV: 3,
  DIGEST: 4,
  REPRO: 5,
  ORNAMENT: 6,
} as const;
export const NT = 7;

export interface TraitDef {
  label: string;
  unit: string;
  min: number;
  max: number;
  init: number;
  /** relative gaussian mutation step, as a fraction of (max-min) */
  step: number;
}

export interface SpeciesCfg {
  traits: TraitDef[];
  /** max energy = maxEnergyPerSize * size */
  maxEnergyPerSize: number;
  startEnergyFrac: number;
  /** metabolism (energy/s) = base*(0.4+0.6*size^2) + move + sense + digest costs */
  base: number;
  moveCost: number;
  refSpeed: number;
  senseCost: number;
  digestCost: number;
  turnRate: number;
  accel: number;
  maxAge: number;
  ageSpread: number;
  /** structural biomass = structPerSize * size; built at birth, released at death */
  structPerSize: number;
  /** offspring are provisioned with childFrac * their own max energy */
  childFrac: number;
  /** fraction of the reproduction payment lost to the soil */
  reproWaste: number;
  /** handling time: seconds of digestion before the next meal (Holling type II) */
  feedCd: number;
  /** gape limitation: prey must be smaller than pred.size / gape (predators only) */
  gape: number;
  /** intraguild predation: a rival must be smaller than size / gapeIG to be eaten */
  gapeIG: number;
  /** interference competition: energy/s burned per comparable rival within contestR */
  contestCost: number;
  contestR: number;
  /** energy a predator loses when a herd drives it off */
  failCost: number;
  /** clan tag drift per generation (0 = no lineage identity) */
  tagMut: number;
  /** Herd defence: radius in which clan-mates of the target are counted. Must stay
   *  well below the mean spacing of the prey - with a wide radius the protection
   *  grows with prey density and the predators are squeezed out of existence
   *  (measured: defR 60 drives predators 89 -> 17 over 2400 s). */
  defR: number;
  /** deterrence per clan-mate beyond the first, divided by the attacker's size */
  defK: number;
  /** convexity of the herd bonus: >1 means a real cluster protects, a chance
   *  neighbour does not - this is what can select for grouping rather than for
   *  passively enjoying ambient density */
  defExp: number;
  /** two herbivores count as clan-mates if their tags differ by less than this */
  clanWidth: number;
  /** mouth / attack radius = eatReach * size */
  eatReach: number;
  /** seconds before a newborn (or a fresh parent) can divide again */
  cooldown: number;
  /** search radius for a receptive mate = mateReach * size */
  mateReach: number;
  /** energy/s burned while courting, per unit of (ornament * court output) */
  courtCost: number;
  /** seconds a receptive individual can go without finding a mate before it
   *  is allowed to fall back to solo (asexual) reproduction instead */
  isolationTime: number;
}

const traitCommon = { step: 0.05 };

export const CFG = {
  seed: 20260903,
  dt: 1 / 60,

  world: {
    radius: 560,
    /** total energy in the closed system: soil + plants + flesh */
    totalEnergy: 200_000,
  },

  start: { plants: 900, herb: 240, pred: 24 },

  plant: {
    cap: 2600,
    maxEnergy: 20,
    /** growth per plant per second at unlimited soil */
    grow: 2.0,
    /** Monod half-saturation constant of the soil pool */
    soilHalf: 40_000,
    /** seeding attempts per second at unlimited soil */
    seedRate: 320,
    seedCost: 2,
    /** self-thinning: a seed fails if another plant is already this close */
    spacing: 15,
    /** probability that a new seed lands next to an existing plant */
    clusterP: 0.75,
    clusterSigma: 40,
  },

  herb: {
    traits: [
      { label: 'speed', unit: 'px/s', min: 10, max: 160, init: 55, ...traitCommon },
      { label: 'size', unit: '', min: 0.6, max: 2.2, init: 1.0, ...traitCommon },
      { label: 'sense', unit: 'px', min: 25, max: 150, init: 70, ...traitCommon },
      { label: 'fov', unit: 'rad', min: 0.7, max: 5.0, init: 2.4, ...traitCommon },
      { label: 'digest', unit: '', min: 0.35, max: 0.95, init: 0.65, ...traitCommon },
      { label: 'repro', unit: '', min: 0.45, max: 0.95, init: 0.62, ...traitCommon },
      { label: 'ornament', unit: '', min: 0.1, max: 1.0, init: 0.4, ...traitCommon },
    ],
    maxEnergyPerSize: 100,
    startEnergyFrac: 0.5,
    base: 0.75,
    moveCost: 0.9,
    refSpeed: 60,
    senseCost: 0.003,
    digestCost: 0.4,
    turnRate: 3.2,
    accel: 6,
    maxAge: 150,
    ageSpread: 0.25,
    structPerSize: 20,
    childFrac: 0.25,
    gape: 0,
    gapeIG: 0,
    contestCost: 0,
    contestR: 0,
    failCost: 0,
    tagMut: 0.012,
    defR: 34,
    defK: 0.12,
    defExp: 1.0,
    clanWidth: 0.06,
    reproWaste: 0.12,
    feedCd: 0.6,
    eatReach: 3.5,
    cooldown: 2,
    mateReach: 16,
    courtCost: 0.6,
    isolationTime: 6,
  } as SpeciesCfg,

  pred: {
    traits: [
      { label: 'speed', unit: 'px/s', min: 10, max: 180, init: 70, ...traitCommon },
      { label: 'size', unit: '', min: 0.7, max: 3.0, init: 1.3, ...traitCommon },
      { label: 'sense', unit: 'px', min: 25, max: 170, init: 90, ...traitCommon },
      { label: 'fov', unit: 'rad', min: 0.7, max: 5.0, init: 2.0, ...traitCommon },
      { label: 'digest', unit: '', min: 0.35, max: 0.95, init: 0.70, ...traitCommon },
      { label: 'repro', unit: '', min: 0.50, max: 0.95, init: 0.70, ...traitCommon },
      { label: 'ornament', unit: '', min: 0.1, max: 1.0, init: 0.4, ...traitCommon },
    ],
    maxEnergyPerSize: 180,
    startEnergyFrac: 0.5,
    base: 0.88,
    moveCost: 0.9,
    refSpeed: 80,
    senseCost: 0.003,
    digestCost: 0.4,
    turnRate: 3.0,
    accel: 6,
    maxAge: 180,
    ageSpread: 0.25,
    structPerSize: 25,
    childFrac: 0.25,
    gape: 1.2,
    gapeIG: 1.35,
    contestCost: 0.5,
    contestR: 35,
    failCost: 5,
    tagMut: 0,
    defR: 0,
    defK: 0,
    defExp: 1,
    clanWidth: 0,
    reproWaste: 0.12,
    feedCd: 3.0,
    eatReach: 3.5,
    cooldown: 4,
    mateReach: 16,
    courtCost: 0.6,
    isolationTime: 10,
  } as SpeciesCfg,

  mut: {
    /** per-weight mutation probability */
    rate: 0.12,
    /** gaussian step on a mutated weight */
    sigma: 0.10,
  },

  /** live experiment knobs - safe to change mid-run */
  env: {
    /** mutation rate + step multiplier ("radiation") */
    radiation: 1,
    /** plant growth + seeding multiplier ("drought" < 1) */
    drought: 1,
    /** metabolic cost multiplier ("temperature") */
    metabolism: 1,
  },

  caps: { herb: 2600, pred: 700 },
};

export type Config = typeof CFG;
