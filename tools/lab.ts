/**
 * Headless experiment runner - the model's test bench.
 *   npm run lab                      # 600 s, default params
 *   npm run lab -- --secs 1800 --seed 7 --every 60
 *   npm run lab -- --set env.drought=0.6 --set mut.rate=0.3
 */
import { World } from '../src/sim/world';
import { CFG } from '../src/sim/config';
import { NT } from '../src/sim/config';

const argv = process.argv.slice(2);
function arg(name: string, def: number): number {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? Number(argv[i + 1]) : def;
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set') {
    const [path, val] = String(argv[i + 1]).split('=');
    const keys = path.split('.');
    let o: Record<string, unknown> = CFG as unknown as Record<string, unknown>;
    for (let k = 0; k < keys.length - 1; k++) o = o[keys[k]] as Record<string, unknown>;
    if (val === undefined || Number.isNaN(Number(val))) {
      console.error(`# bad --set value for ${path}`);
      process.exit(1);
    }
    o[keys[keys.length - 1]] = Number(val);
    console.log(`# set ${path} = ${val}`);
  }
}

const secs = arg('secs', 600);
const seed = arg('seed', CFG.seed);
const every = arg('every', 30);

const w = new World(seed);
const e0 = w.audit();
const ticks = Math.round(secs / CFG.dt);
const stride = Math.round(every / CFG.dt);

function mean(a: Float32Array, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i];
  return n ? s / n : 0;
}
function meanFrac(a: Float32Array, b: Float32Array, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] / b[i];
  return n ? s / n : 0;
}

const hT = new Float32Array(NT);
const pT = new Float32Array(NT);
const COLS = ['t', 'plant', 'herb', 'pred', 'soil', 'grz', 'eat', 'bH', 'stH', 'agH', 'bP', 'stP', 'agP', 'def', 'can', 'sxH', 'sxP', 'vAct', 'eFrac', 'grp', 'clan', 'hSpd', 'hSize', 'hSns', 'hFov', 'hDig', 'hRep', 'hOrn', 'pSpd', 'pSize', 'pSns', 'pOrn', 'hGen', 'pGen'];
console.log(COLS.map((s) => s.padStart(6)).join(''));
let prev = { ...w.counters };

let extinctHerb = -1;
let extinctPred = -1;
let peakH = 0;
let peakP = 0;
const t0 = Date.now();

for (let k = 0; k <= ticks; k++) {
  if (k % stride === 0) {
    const s = w.sample();
    w.meanTraits(w.herb, hT);
    w.meanTraits(w.pred, pT);
    const c = w.counters;
    const d = (k: keyof typeof c) => c[k] - prev[k];
    const row = [
      s.t.toFixed(0), s.plants, s.herb, s.pred, s.soil.toFixed(0),
      d('grazed'), d('eaten'), d('bornH'), d('starvedH'), d('agedH'), d('bornP'), d('starvedP'), d('agedP'), d('defended'), d('cannibal'),
      d('sexH'), d('sexP'),
      mean(w.herb.spd, w.herb.n).toFixed(1),
      meanFrac(w.herb.energy, w.herb.emax, w.herb.n).toFixed(2),
      s.group.toFixed(2),
      s.clans.toFixed(1),
      hT[0].toFixed(0), hT[1].toFixed(2), hT[2].toFixed(0), hT[3].toFixed(2), hT[4].toFixed(2), hT[5].toFixed(2), hT[6].toFixed(2),
      pT[0].toFixed(0), pT[1].toFixed(2), pT[2].toFixed(0), pT[6].toFixed(2),
      s.hGen.toFixed(1), s.pGen.toFixed(1),
    ];
    console.log(row.map((v) => String(v).padStart(6)).join(''));
    prev = { ...c };
  }
  peakH = Math.max(peakH, w.herb.n);
  peakP = Math.max(peakP, w.pred.n);
  if (w.herb.n === 0 && extinctHerb < 0) extinctHerb = w.t;
  if (w.pred.n === 0 && extinctPred < 0) extinctPred = w.t;
  w.step();
}

const e1 = w.audit();
const ms = Date.now() - t0;
console.log('---');
console.log(`sim ${secs}s in ${ms}ms  (${(ticks / (ms / 1000) / 1000).toFixed(1)}k ticks/s, x${(secs / (ms / 1000)).toFixed(0)} realtime)`);
console.log(`energy: start ${e0.toFixed(1)}  end ${e1.toFixed(1)}  drift ${(e1 - e0).toFixed(4)}`);
console.log(`peaks: herb ${peakH}  pred ${peakP}`);
console.log(`first extinction: herb ${extinctHerb < 0 ? 'never' : extinctHerb.toFixed(0) + 's'}, pred ${extinctPred < 0 ? 'never' : extinctPred.toFixed(0) + 's'}`);
console.log(`totals: grazed ${w.counters.grazed}  eaten ${w.counters.eaten}  bornH ${w.counters.bornH}  bornP ${w.counters.bornP}  starvedH ${w.counters.starvedH}  starvedP ${w.counters.starvedP}`);
console.log(
  `mating: sexH ${w.counters.sexH}/${w.counters.bornH} (${w.counters.bornH ? ((100 * w.counters.sexH) / w.counters.bornH).toFixed(0) : 0}%)  ` +
    `sexP ${w.counters.sexP}/${w.counters.bornP} (${w.counters.bornP ? ((100 * w.counters.sexP) / w.counters.bornP).toFixed(0) : 0}%)`,
);
