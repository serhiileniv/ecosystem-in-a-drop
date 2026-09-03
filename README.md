# Ecosystem in a Drop

A closed petri dish with three trophic levels — vegetation, herbivores, predators.
Nobody is trained and nothing is scripted: every animal carries its own 23→8→4
neural network, and the only optimiser is *dying, or living, without offspring* —
reproduction is sexual, with mate choice, genetic recombination, and a fallback for
when nobody's around.

Zero runtime dependencies. Vanilla TypeScript, one Canvas2D surface, all state in
typed arrays (struct-of-arrays), single threaded, deterministic from a seed.

![12 real seconds inside a fast-forwarded run: predators, herbivores and the trait-evolution panel all moving live](docs/demo.gif)

A 12-second clip from partway through a run. The full [~98s recording](docs/demo.mp4)
starts at generation 0 and walks through a predator cull and a radiation flare before
this fast-forward segment.

```bash
npm install
npm run dev        # http://localhost:5173
npm run lab        # headless experiment runner, prints a time series
```

---

## The model

The dish is **energetically closed**. One number — 200 000 units — is split between
the soil, the plants, and the flesh of the animals, and every transaction moves it
between those pools. Nothing is created, nothing leaks; respiration returns energy
to the soil as surely as a corpse does. `audit()` re-adds the whole dish every frame
and the panel prints it, so any drift is visible immediately.

That single constraint is what makes the population dynamics real rather than
decorative: a herbivore boom is *literally* the soil pool moving into cyan triangles.

| Process | Mechanism |
| --- | --- |
| Plant growth | Monod uptake: `grow · soil/(soil + K)`. Vegetation stalls as the soil empties. |
| Plant recruitment | Seeds land near a parent (75 %) or anywhere (25 %) and fail if another plant is within 15 px — **self-thinning**, so the lawn has a spatial carrying capacity instead of an arbitrary cap. |
| Feeding | Contact with the mouth radius, then a **handling time** before the next meal (Holling type II). Without it a predator has an unbounded kill rate and the system always collapses. |
| Predation | **Gape limitation**: a predator can only swallow prey smaller than `size / 1.2`. This is what keeps the food chain a chain — and it is the mechanism behind the size arms race described below. |
| Intraguild predation | Predators are prey to each other: one can eat a rival below `size / 1.35`. Cannibalism gives the top level something to fall back on when herbivores are scarce, and it puts a permanent premium on being the bigger animal. |
| Dominance contests | Rivals too close in size to eat each other still burn energy on interference when they meet (`contestCost` per rival per second within 35 px). This is a density-dependent brake on the predator population that costs no prey. |
| Herd defence | An attack on a herbivore is broken off with probability `d/(1+d)`, where `d = defK · (clan-mates within 34 px) / attacker size`. The attacker pays for the failed rush. Nothing here makes herbivores group — it only makes grouping *pay*, and leaves the behaviour to evolution. |
| Clan markers | Every herbivore carries a heritable marker in [0,1) that drifts a little each generation and is under no selection of its own. Only creatures whose markers differ by less than 0.06 count as each other's defenders, so "who is my tribe" is inherited rather than assigned. Herbivores are tinted by marker in the dish (`c` toggles it). |
| Reproduction | **Sexual**, with mate choice and genetic recombination — see below. Offspring always get a fixed provision of their own capacity plus their structural biomass, funded by whoever is paying for them, so a newborn is always viable and only the parent(s) gamble. |
| Death | Starvation or old age. Body and reserves go back to the soil. |
| Metabolism | `base·(0.4+0.6·size²) + move·(v/v₀)²·size + sense·range + digest·efficiency`. Every trait has a running cost, so nothing is free to maximise. |

### The brain

Each animal has a fixed-topology MLP with 228 weights, stored inline in the
population's flat `Float32Array`.

```
23 inputs → 8 hidden (tanh) → 4 outputs (tanh)
```

Vision is a cone of `fov` radians split into **5 sectors**, and each sector reports
the nearest object on **4 channels** (20 values). The channels are relative to the
species:

| | channel 0 "food" | channel 1 "kin" | channel 2 "risk" | channel 3 "mate" |
| --- | --- | --- | --- | --- |
| herbivore | plants | herbivores | predators | herbivores, weighted by courtship |
| predator | herbivores | predators | plants | predators, weighted by courtship |

The "mate" channel re-scans the same population as "kin", but an individual is only
visible on it if it is currently *both* receptive and actively courting — bare
presence doesn't show up, the way it does on "kin". Plus normalised energy, local
crowding of its own species, and a bias. Outputs are thrust, turn, *ready to
reproduce*, and *court* (see below). Select any creature to see its live cone in the
dish and its live activations in the panel.

### Heritable traits

`speed · size · sense range · field of view · digestive efficiency · reproduction
threshold · ornament`, each mutated by a gaussian step at birth, each clamped to a
range, each paid for through metabolism (the ornament through the courtship cost
below). The trait chart plots the population mean of all seven, normalised to their
own limits.

## Sexual reproduction

Reproduction is sexual for both species, with mate choice expressed entirely through
the brain rather than a hard-coded rule, real genetic recombination between two
parents, and a self-fertilisation fallback so an isolated individual is never a
guaranteed dead end.

**Courtship.** A creature that is energetically ready to reproduce (`ready` output
> 0, off cooldown, above its `repro` trait threshold) can also `court`: broadcasting
its heritable `ornament` trait at a cost proportional to `ornament × court output`,
paid every tick it does so. This is a classic costly ("handicap principle") signal —
an animal with a large ornament and a brain willing to spend energy advertising it
is demonstrably able to afford the cost, which is the only reason the signal can't
just be faked for free. The signal is what shows up on other creatures' "mate"
channel; a receptive-but-silent animal (`court` ≤ 0) is invisible to searching
partners, and an animal that isn't receptive at all shows nothing regardless of
`court`.

**Choice.** There is no hard-coded preference trait. Whatever attraction exists is
whatever the network has evolved to do with the "mate" input — steer toward it,
ignore it, or (in principle) steer away from it. This is deliberately the harder,
more open-ended version of Fisherian sexual selection: the model gives evolution the
sensory and behavioural primitives for mate choice and lets it decide whether choice
is worth having.

**Mating.** When a receptive creature finds another receptive, same-species
individual within `mateReach`, they pair: the child's genome is built by
*independent assortment* (each of the 7 heritable traits comes from a coin flip
between the two parents, then mutates by the normal per-trait step) and *uniform
crossover* of the two parents' 228 brain weights (each weight independently
inherited from one parent or the other, then mutated by the normal per-weight rate).
A child can therefore combine a strength from each parent that neither parent's own
solo clone ever could — this is the actual genetic novelty sexual reproduction adds
on top of point mutation. Both parents pay half the child's provisioning cost.

**The fallback.** If no mate turns up, the search keeps failing every tick, and a
per-individual clock — ticking only while the animal is actually receptive and
searching — keeps running. Past `isolationTime` (6 s herbivores, 10 s predators) the
animal self-fertilises instead: the ordinary single-parent clone-and-mutate path,
funded entirely by itself. This exists specifically so a genuinely isolated survivor
(the aftermath of a cull, say) is never locked out of reproducing just because
nobody else is around — see the Allee-effect bug below for why getting this right
mattered more than it looked like it would.

**The trade.** This is the closest the model comes to reproducing the textbook
"two-fold cost of sex": sexual offspring cost each parent only half of what a solo
clone costs, but *only* if a partner can be found in time, and courtship itself is a
running tax on top. Measured at the shipped settings, the population is a real mixed
economy rather than one strategy dominating — see below.

---

## What to watch for

Numbers below are from seed 4242, measured with `tools/exp.ts` — your seed will
differ in detail, not in kind. Bullets predating sexual reproduction (which shifted
the whole population baseline) are kept because the qualitative finding still holds
when re-measured, not because the exact figures are current.

- **Lotka–Volterra cycles.** The phase portrait (prey → predator) traces a genuine
  orbit rather than a point. Prey peak, predators follow about a quarter-cycle later.
- **A size arms race.** Gape limitation means prey that grow bigger become
  uneatable; predators answer by growing too, until the metabolic cost of a large
  body bites. In most seeds herbivore mean size climbs for a few hundred seconds,
  predator size chases it up (1.3 → 2.2 is typical), and then the prey lineage
  switches strategy — small, cheap and fast — and predator size falls back behind it.
  It is visible in the dish before it is visible in the chart.
- **Predator release, and how quickly it heals.** Killing 90 % of the predators does
  *not* cause a runaway: herbivores rise (219 → 280), vegetation dips about 30 %
  (616 → 441), and the predators are back to full strength within ~300 s. The dish
  is a damped system, not a knife edge — which is precisely why it survives long
  enough to be interesting.
- **The top of the chain is the fragile part.** Every stress tested so far removes
  the predators first and leaves a working two-level ecosystem behind:

  | perturbation | outcome after 900 s |
  | --- | --- |
  | radiation ×8 | predators extinct within 150 s (too small a population to hold its behaviour against the mutation load); herbivores unaffected |
  | rainfall ×0.35 | everything shrinks by half, predators extinct, herbivores persist at ~120 |
  | temperature ×2 | predators extinct within ~400 s, herbivores *rise* — the release outweighs the extra cost |

  There is no immigration, so an extinct level stays extinct. Use *+20 naive
  predators* to reseed one and watch a random-brained population get selected into
  competence over a few hundred seconds.
- **Predators eat each other.** Cannibalism is a real but minor channel: 0.5–3 % of
  all predator kills, and it roughly triples during a prey trough (0.5 % → 1.9 % on
  the default seed between t=900 and t=3600), which is when it matters — the top
  level cannibalises its way through a shortage instead of simply starving out.
  Dominance contests between same-size rivals add a density-dependent brake that
  costs no prey at all.
- **Herds are used, but they are not chosen.** This is the most interesting negative
  result in the model, and it is worth stating plainly: herd defence *works* —
  10–25 % of attacks are broken off by the target's clan-mates — but it does **not**
  cause herding to evolve. Measured against a matched control on the same seed, the
  aggregation index is 0.78–0.89 with defence off and 0.82–0.99 with it on, over
  2400 s. The mild clumping you can see in the dish is the patchy vegetation, not
  anti-predator behaviour. Three payoff shapes were tried:

  | herd bonus | result |
  | --- | --- |
  | linear, strong (`defK` 0.42) | no herding; predators extinct by t≈500 |
  | convex threshold (`(n-1)^1.4`) | no herding — a herd is valuable but no individual step toward one pays, so selection has nothing to climb |
  | linear, gentle (shipped: `defK` 0.12, r 34 px) | no herding; predators oscillate 22–56 with no extinction over 3600 s |
  | linear over a wide radius (r 60 px) | no herding; protection scales with prey density and predators decline 89 → 17 |

  So the dish gives you the *opportunity* for tribes and the animals decline to take
  it. Whether that is a limit of a 5-sector nearest-neighbour eye, of an 8-unit
  hidden layer, or of the trade-off against grazing competition is exactly the sort
  of thing the aggregation chart and the *disarm herds* button are there to test.
- **Clans are real even when herds are not.** The inherited marker collapses from ~18
  effective variants to 3–4 within a few hundred seconds and stays there — a handful
  of lineages own the dish, and you can see them as distinct tints. That is drift and
  selective sweeps, not tribal warfare; do not read more into it than that.
- **Sex settles into a real mixed economy, not a landslide.** Across five seeds at
  1800–3600 s, 44–55 % of herbivore births and 19–41 % of predator births are
  sexual; the rest are the solo fallback. Predators mate less often than herbivores
  for a mundane reason — they're rarer, `mateReach` scales with size not sense
  range, and `isolationTime` is longer (10 s vs 6 s) — not because the model favours
  one strategy over the other. Neither reproductive mode goes to zero on any seed
  tested, which is itself the finding: the isolation fallback keeps solo
  reproduction from disappearing even where mates are usually available.
- **An Allee-effect bug, caught by testing the model's own claims.** The first
  version of the isolation clock reset to zero on every tick an individual wasn't
  "receptive" - so a marginal survivor whose energy dipped below the reproduction
  threshold even briefly lost all its accumulated search time and had to restart the
  full `isolationTime` wait from scratch. Cull 90 % of the predators down to 1–2
  stragglers and it was reproducible: they went extinct in the first 20 s post-cull
  despite the fallback existing on paper, because they could never hold "receptive"
  for one unbroken stretch that long. The fix decouples the clock from momentary
  energy dips (it only pauses, never resets, while not receptive) - after which the
  same 90 % cull recovers in the same few hundred seconds the pre-sexual model did.
  Left as-is, this would have been a real, if narrow, avenue to permanent predator
  extinction from an ordinary cull button click - the kind of failure mode sexual
  reproduction introduces for free and asexual division structurally cannot have,
  since a single asexual survivor never needs anyone else's cooperation to
  reproduce. Worth knowing if you tune `isolationTime` down: the effect only gets
  easier to trigger, not harder.
- **Size arms races don't always reverse now.** Under the old asexual model, prey
  and predator size cycled up during an arms race and then predators recovering with
  a wave of new small-and-cheap prey; that still happens on most seeds. On at least
  one tested seed, prey and predator size instead pinned at the trait ceiling
  (herb 2.2/2.2, pred 2.8+/3.0) and stayed there through 2400 s without a reversal
  - the population survived (it never dropped below double digits), but the escape
  valve that used to reliably reset the arms race didn't fire. Whether mate search
  and courtship cost are what's keeping size pinned, or it's just a longer-tailed
  version of dynamics the asexual model already had, is an open question - not a
  claim, a flag for anyone poking at this next.
- **The energy budget bar** under the state readout is the whole story in one line:
  a healthy dish keeps most of its energy in the soil; a dying one has it stranded in
  biomass that nothing can eat.

## Controls

| | |
| --- | --- |
| `Space` | pause / resume |
| `.` | single tick |
| `v` | toggle the vision cone of the selected creature |
| `c` | toggle clan tinting of the herbivores |
| click | inspect a creature (traits, energy, live network) |

**Environment** — radiation (mutation rate and step), rainfall (plant growth and
seeding), temperature (metabolic cost), and herd defence. All four are live;
changing them mid-run is the point.

Herd defence is a slider rather than a constant because it is a genuine trade-off
and the interesting part is the shape of it, not any one setting:

| `defK` | attacks repelled | predators |
| --- | --- | --- |
| 0.10 | ~3 % | oscillate 22–141, stable over 3600 s |
| 0.12 (default) | 3–6 % | oscillate 22–56, no extinction over 3600 s on either seed tested |
| 0.15 | 10–25 % | survive on some seeds, collapse to <5 on others |
| 0.42 | most | extinct by t≈500 |

Safety for the prey is bought directly out of the predators' food budget. There is
no setting that gives you both a strongly defended herd and a healthy top predator —
which is itself the result.

**Perturbations** — culls, a fire, naive immigrants, a 30 s radiation flare, and
*disarm herds*, which switches herd defence off for 30 s so you can see how much of
the herbivores' survival is actually coming from standing together.

**Run** — seed, reset, and CSV export of the whole recorded time series.

### URL parameters

`?seed=123&speed=4&warmup=900&inspect=herb`

`warmup` runs N simulated seconds headlessly before the first frame, so you can open
straight into an equilibrium instead of watching the founding generations.

## Headless lab

```bash
npm run lab -- --secs 1800 --seed 7 --every 60
npm run lab -- --secs 900 --set env.drought=0.5 --set mut.rate=0.4
npx vite-node tools/exp.ts -- drought      # perturb a settled dish, print the response
```

Prints populations, per-interval event counts (grazing, kills, births, starvation,
old age, sexual matings, cannibalism, mobbing), mean traits including ornament, mean
generation, an energy-conservation check and a throughput figure. The final line
breaks down each species' births into sexual vs. solo-fallback. `--set a.b=c`
reaches any field of `src/sim/config.ts`, which is where every tunable number in
the model lives — `herb.mateReach`, `pred.isolationTime` and `pred.courtCost` are
the ones worth starting with if you want to push on the mating mechanics.

## Layout

```
src/core/rng.ts        mulberry32 + gaussian, the single source of randomness
src/core/grid.ts       uniform spatial hash, counting-sorted, rebuilt each tick
src/core/history.ts    ring buffer of named series + CSV
src/sim/config.ts      every tunable number
src/sim/brain.ts       the MLP: layout, forward pass, inheritance
src/sim/world.ts       populations, senses, metabolism, the tick
src/render/view.ts     the dish
src/render/charts.ts   populations / phase portrait / social structure / traits
src/render/netview.ts  the selected brain
src/main.ts            loop, panel, input
tools/lab.ts           headless runner
```

Determinism: same seed + same parameters + same number of ticks ⇒ identical run.
Every random draw goes through one `Rng` instance owned by the world.
