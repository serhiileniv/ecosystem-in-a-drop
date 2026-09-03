import './style.css';
import { CFG, NT, TR } from './sim/config';
import { KIND, World, type Pop } from './sim/world';
import { NW } from './sim/brain';
import { History } from './core/history';
import { DishView } from './render/view';
import { Chart, drawPopulations, drawPhase, drawTraits, drawSocial, TRAIT_COLORS } from './render/charts';
import { drawNet } from './render/netview';

// ---------------------------------------------------------------- plumbing

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const SAMPLE_TICKS = 30; // one sample every 0.5 simulated seconds
const WINDOW = 1200; // samples shown in the charts (= 10 simulated minutes)

const SERIES = [
  't', 'plants', 'herb', 'pred', 'soil', 'biomass', 'hEnergy', 'pEnergy',
  'hGen', 'pGen', 'grazed', 'eaten', 'bornH', 'bornP', 'deadH', 'deadP',
  'group', 'clans', 'defended', 'cannibal', 'contest', 'sexH', 'sexP',
  ...Array.from({ length: NT }, (_, k) => 'hT' + k),
  ...Array.from({ length: NT }, (_, k) => 'pT' + k),
];

// ?seed=123&speed=4&warmup=900&inspect=herb - reproducible entry points
const QS = new URLSearchParams(location.search);
const qNum = (k: string, d: number) => (QS.has(k) ? Number(QS.get(k)) : d);

let world = new World(qNum('seed', CFG.seed));
const hist = new History(SERIES, 3000);
const view = new DishView($<HTMLCanvasElement>('dish'));
const chPop = new Chart($<HTMLCanvasElement>('chPop'));
const chPhase = new Chart($<HTMLCanvasElement>('chPhase'));
const chSocial = new Chart($<HTMLCanvasElement>('chSocial'));
const chTraits = new Chart($<HTMLCanvasElement>('chTraits'));
const chNet = new Chart($<HTMLCanvasElement>('chNet'));

let speed = 1;
let lastSpeed = 1;
let traitSp: 'herb' | 'pred' = 'herb';
let selKind = -1;
let selUid = -1;
let selIndex = -1;
let flareUntil = -1;
let disarmUntil = -1;

const prev = {
  grazed: 0, eaten: 0, bornH: 0, bornP: 0, deadH: 0, deadP: 0,
  defended: 0, cannibal: 0, contest: 0, sexH: 0, sexP: 0,
};

// ---------------------------------------------------------------- sampling

function takeSample(): void {
  const s = world.sample();
  const c = world.counters;
  const dt = SAMPLE_TICKS * CFG.dt;
  const deadH = c.starvedH + c.agedH;
  const deadP = c.starvedP + c.agedP;
  const row: Record<string, number> = {
    t: s.t,
    plants: s.plants,
    herb: s.herb,
    pred: s.pred,
    soil: s.soil,
    biomass: s.biomass,
    hEnergy: s.hEnergy,
    pEnergy: s.pEnergy,
    hGen: s.hGen,
    pGen: s.pGen,
    grazed: (c.grazed - prev.grazed) / dt,
    eaten: (c.eaten - prev.eaten) / dt,
    bornH: (c.bornH - prev.bornH) / dt,
    bornP: (c.bornP - prev.bornP) / dt,
    deadH: (deadH - prev.deadH) / dt,
    deadP: (deadP - prev.deadP) / dt,
    group: s.group,
    clans: s.clans,
    defended: (c.defended - prev.defended) / dt,
    cannibal: (c.cannibal - prev.cannibal) / dt,
    contest: (c.contest - prev.contest) / dt,
    sexH: (c.sexH - prev.sexH) / dt,
    sexP: (c.sexP - prev.sexP) / dt,
  };
  for (let k = 0; k < NT; k++) {
    row['hT' + k] = s.hTraits[k];
    row['pT' + k] = s.pTraits[k];
  }
  hist.push(row);
  prev.grazed = c.grazed;
  prev.eaten = c.eaten;
  prev.bornH = c.bornH;
  prev.bornP = c.bornP;
  prev.deadH = deadH;
  prev.deadP = deadP;
  prev.defended = c.defended;
  prev.cannibal = c.cannibal;
  prev.contest = c.contest;
  prev.sexH = c.sexH;
  prev.sexP = c.sexP;
}

// ------------------------------------------------------------------- panel

function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function paintState(): void {
  const w = world;
  $('nPlant').textContent = String(w.plants.n);
  $('nHerb').textContent = String(w.herb.n);
  $('nPred').textContent = String(w.pred.n);
  $('clock').textContent = clock(w.t);

  const rows: [string, string][] = [
    ['ticks', w.ticks.toLocaleString('en-US')],
    ['gen · herb', hist.len ? hist.last('hGen').toFixed(1) : '0'],
    ['gen · pred', hist.len ? hist.last('pGen').toFixed(1) : '0'],
    ['grazing /s', hist.len ? hist.last('grazed').toFixed(1) : '0'],
    ['kills /s', hist.len ? hist.last('eaten').toFixed(2) : '0'],
    ['births /s', hist.len ? (hist.last('bornH') + hist.last('bornP')).toFixed(2) : '0'],
    ['· sexual %', hist.len ? matingPct() : '–'],
    ['deaths /s', hist.len ? (hist.last('deadH') + hist.last('deadP')).toFixed(2) : '0'],
    ['mobbed /s', hist.len ? hist.last('defended').toFixed(2) : '0'],
    ['cannibal /s', hist.len ? hist.last('cannibal').toFixed(2) : '0'],
    ['herding', hist.len ? hist.last('group').toFixed(2) : '–'],
    ['clans', hist.len ? hist.last('clans').toFixed(1) : '–'],
    ['energy', Math.round(w.audit()).toLocaleString('en-US')],
  ];
  $('stateKv').innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');

  // energy budget bar
  let biomass = 0;
  for (let i = 0; i < w.plants.n; i++) biomass += w.plants.e[i];
  let he = 0;
  for (let i = 0; i < w.herb.n; i++) he += w.herb.energy[i] + w.herb.struct[i];
  let pe = 0;
  for (let i = 0; i < w.pred.n; i++) pe += w.pred.energy[i] + w.pred.struct[i];
  const total = w.soil + biomass + he + pe || 1;
  $('barSoil').style.width = `${(w.soil / total) * 100}%`;
  $('barPlant').style.width = `${(biomass / total) * 100}%`;
  $('barHerb').style.width = `${(he / total) * 100}%`;
  $('barPred').style.width = `${(pe / total) * 100}%`;
}

/** % of this interval's births that came from two parents rather than the
 *  solo (isolation) fallback - the visible half of the "cost of sex" trade. */
function matingPct(): string {
  const born = hist.last('bornH') + hist.last('bornP');
  const sex = hist.last('sexH') + hist.last('sexP');
  return born > 0 ? `${Math.round((100 * sex) / born)}%` : '–';
}

function traitLegend(): void {
  const defs = (traitSp === 'herb' ? CFG.herb : CFG.pred).traits;
  $('traitLegend').innerHTML = defs
    .map((d, k) => `<span><i style="background:${TRAIT_COLORS[k]}"></i>${d.label}</span>`)
    .join('');
}

function bar(frac: number, marker = -1): string {
  const f = Math.max(0, Math.min(1, frac));
  const m = marker >= 0 ? `<u style="left:${(marker * 100).toFixed(1)}%"></u>` : '';
  return `<span class="track"><i style="width:${(f * 100).toFixed(1)}%"></i>${m}</span>`;
}

function paintInspector(): void {
  const box = $('inspector');
  if (selIndex < 0) {
    box.className = 'empty';
    box.textContent = 'no creature selected';
    drawNet(chNet, null, 0, world.lastInp, world.lastHid, world.lastOut, selKind);
    return;
  }
  const p: Pop = selKind === KIND.PRED ? world.pred : world.herb;
  const i = selIndex;
  const defs = p.cfg.traits;
  const tb = i * NT;
  const size = p.T[tb + TR.SIZE];
  const spd = p.spd[i];
  const burn =
    (p.cfg.base * (0.4 + 0.6 * size * size) +
      p.cfg.moveCost * (spd / p.cfg.refSpeed) ** 2 * size +
      p.cfg.senseCost * p.T[tb + TR.SENSE] +
      p.cfg.digestCost * p.T[tb + TR.DIGEST]) *
    CFG.env.metabolism;

  const tag = selKind === KIND.PRED ? 'pred' : 'herb';
  const rows = defs
    .map((d, k) => {
      const v = p.T[tb + k];
      const f = (v - d.min) / (d.max - d.min);
      const init = (d.init - d.min) / (d.max - d.min);
      const txt = d.max > 10 ? v.toFixed(0) : v.toFixed(2);
      return `<span>${d.label}</span>${bar(f, init)}<span>${txt}</span>`;
    })
    .join('');
  const isolation = p.cfg.isolationTime;

  box.className = '';
  box.innerHTML =
    `<div class="ins-head"><span class="tag ${tag}">${tag}</span>` +
    `<b>#${p.uid[i]}</b><span style="color:var(--dim);font-size:11px">generation ${p.gen[i]}</span></div>` +
    `<div class="ins-grid">` +
    `<span>energy</span>${bar(p.energy[i] / p.emax[i])}<span>${Math.round(p.energy[i])}</span>` +
    `<span>age</span>${bar(p.age[i] / p.maxAge[i])}<span>${p.age[i].toFixed(0)}s</span>` +
    rows +
    `<span>burn/s</span>${bar(burn / 7)}<span>${burn.toFixed(2)}</span>` +
    `<span>moving</span>${bar(spd / p.T[tb + TR.SPEED])}<span>${spd.toFixed(0)}</span>` +
    `<span>ingested</span>${bar(Math.min(1, p.fed[i] / 600))}<span>${Math.round(p.fed[i])}</span>` +
    `<span>young</span>${bar(Math.min(1, p.kids[i] / 8))}<span>${p.kids[i]}</span>` +
    `<span>receptive</span>${bar(p.receptive[i])}<span>${p.receptive[i] ? 'yes' : 'no'}</span>` +
    `<span>courting</span>${bar(p.display[i])}<span>${p.display[i].toFixed(2)}</span>` +
    `<span>seeking</span>${bar(isolation ? p.lonely[i] / isolation : 0)}<span>${p.lonely[i].toFixed(0)}s</span>` +
    `</div>`;

  drawNet(chNet, p.W, i * NW, world.lastInp, world.lastHid, world.lastOut, selKind);
}

// -------------------------------------------------------------------- loop

let fpsT = performance.now();
let fpsN = 0;
let uiTick = 0;

function loop(): void {
  requestAnimationFrame(loop);

  if (speed > 0) {
    const budget = speed > 4 ? 22 : 10;
    const t0 = performance.now();
    for (let k = 0; k < speed; k++) {
      world.step();
      if (world.ticks % SAMPLE_TICKS === 0) takeSample();
      if (performance.now() - t0 > budget) break;
    }
  }
  if (flareUntil > 0 && world.t > flareUntil) {
    flareUntil = -1;
    CFG.env.radiation = Number($<HTMLInputElement>('sRad').value);
  }
  if (disarmUntil > 0 && world.t > disarmUntil) {
    disarmUntil = -1;
    CFG.herb.defK = Number($<HTMLInputElement>('sDef').value);
  }

  // resolve the inspected creature (indices shift as the population compacts)
  if (selUid >= 0) {
    selIndex = world.indexOfUid(selKind, selUid);
    if (selIndex < 0) {
      selUid = -1;
      selKind = -1;
    } else {
      world.watchKind = selKind;
      world.watchIndex = selIndex;
      world.observe(selKind, selIndex);
    }
  }

  view.draw(world, { kind: selKind, index: selIndex });

  uiTick++;
  if (uiTick % 6 === 0) {
    paintState();
    paintInspector();
    drawPopulations(chPop, hist, WINDOW);
    drawPhase(chPhase, hist, WINDOW);
    drawSocial(chSocial, hist, WINDOW);
    drawTraits(chTraits, hist, traitSp, WINDOW);
  }

  fpsN++;
  const now = performance.now();
  if (now - fpsT > 500) {
    $('fps').textContent = `${Math.round((fpsN * 1000) / (now - fpsT))} fps`;
    fpsT = now;
    fpsN = 0;
  }
}

// ------------------------------------------------------------------ inputs

function setSpeed(v: number): void {
  speed = v;
  if (v > 0) lastSpeed = v;
  for (const b of $('speed').querySelectorAll('button')) {
    b.classList.toggle('on', Number(b.dataset.speed) === v);
  }
}

$('speed').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b) setSpeed(Number(b.dataset.speed));
});
$('stepBtn').addEventListener('click', () => {
  setSpeed(0);
  world.step();
  if (world.ticks % SAMPLE_TICKS === 0) takeSample();
});
$('traitSpecies').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  traitSp = b.dataset.sp === 'pred' ? 'pred' : 'herb';
  for (const x of $('traitSpecies').querySelectorAll('button')) x.classList.toggle('on', x === b);
  traitLegend();
});

const bindSlider = (id: string, out: string, apply: (v: number) => void, fmt = (v: number) => `${v.toFixed(1)}×`) => {
  const el = $<HTMLInputElement>(id);
  const set = () => {
    const v = Number(el.value);
    apply(v);
    $(out).textContent = fmt(v);
  };
  el.addEventListener('input', set);
  set();
};
bindSlider('sRad', 'oRad', (v) => {
  if (flareUntil < 0) CFG.env.radiation = v;
});
bindSlider('sDro', 'oDro', (v) => (CFG.env.drought = v));
bindSlider('sMet', 'oMet', (v) => (CFG.env.metabolism = v));
// Herd defence is a live knob because it is a genuine trade-off, not a constant:
// turn it up and the herbivores get safer while the predators starve out.
bindSlider(
  'sDef',
  'oDef',
  (v) => {
    if (disarmUntil < 0) CFG.herb.defK = v;
  },
  (v) => v.toFixed(2),
);

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-act]')) {
  b.addEventListener('click', () => {
    switch (b.dataset.act) {
      case 'cullH': world.cull(KIND.HERB, 0.5); break;
      case 'cullP': world.cull(KIND.PRED, 0.5); break;
      case 'fire': world.burnPlants(0.7); break;
      case 'injP': world.inject(KIND.PRED, 20); break;
      case 'injH': world.inject(KIND.HERB, 50); break;
      case 'flare':
        CFG.env.radiation = 8;
        flareUntil = world.t + 30;
        break;
      case 'disarm':
        // switch herd defence off for 30 s: how much of the herbivores' safety
        // is actually coming from standing together?
        CFG.herb.defK = 0;
        disarmUntil = world.t + 30;
        break;
    }
  });
}

function resetRun(seed: number): void {
  $<HTMLInputElement>('seed').value = String(seed);
  world.reset(seed);
  hist.clear();
  for (const k of Object.keys(prev) as (keyof typeof prev)[]) prev[k] = 0;
  selUid = selKind = selIndex = -1;
  flareUntil = -1;
  disarmUntil = -1;
  CFG.herb.defK = Number($<HTMLInputElement>('sDef').value);
}
$('resetBtn').addEventListener('click', () => resetRun(Number($<HTMLInputElement>('seed').value) | 0));
$('randBtn').addEventListener('click', () => resetRun((Math.random() * 2 ** 31) | 0));

$('csvBtn').addEventListener('click', () => {
  const blob = new Blob([hist.toCsv()], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ecosystem-seed${world.seed}-t${Math.round(world.t)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

view.canvas.addEventListener('pointerdown', (e) => {
  const p = view.toWorld(e.clientX, e.clientY);
  const hit = world.pick(p.x, p.y, 26 / view.scale);
  if (hit.index >= 0) {
    selKind = hit.kind;
    selIndex = hit.index;
    selUid = (hit.kind === KIND.PRED ? world.pred : world.herb).uid[hit.index];
    $('tip').style.opacity = '0';
  } else {
    selKind = selIndex = -1;
    selUid = -1;
  }
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    setSpeed(speed > 0 ? 0 : lastSpeed);
  } else if (e.key === '.') {
    $('stepBtn').click();
  } else if (e.key === 'v') {
    view.showVision = !view.showVision;
  } else if (e.key === 'c') {
    view.showClans = !view.showClans;
  }
});

const onResize = () => {
  view.resize();
  for (const c of [chPop, chPhase, chSocial, chTraits, chNet]) c.fit();
};
window.addEventListener('resize', onResize);
onResize();
traitLegend();

// optional headless warm-up so a run can start at ecological equilibrium
const warmup = Math.max(0, Math.min(3600, qNum('warmup', 0)));
if (warmup > 0) {
  const n = Math.round(warmup / CFG.dt);
  for (let k = 0; k < n; k++) {
    world.step();
    if (world.ticks % SAMPLE_TICKS === 0) takeSample();
  }
}
$<HTMLInputElement>('seed').value = String(world.seed);
setSpeed(qNum('speed', 1));

const want = QS.get('inspect');
if (want === 'herb' || want === 'pred') {
  const p = want === 'pred' ? world.pred : world.herb;
  if (p.n > 0) {
    selKind = want === 'pred' ? KIND.PRED : KIND.HERB;
    selIndex = (p.n / 2) | 0;
    selUid = p.uid[selIndex];
  }
}

takeSample();
loop();
