/** Ad-hoc perturbation experiments: npx vite-node tools/exp.ts -- <mode> */
import { World, KIND } from '../src/sim/world';
import { CFG } from '../src/sim/config';

const mode = process.argv[2] ?? 'none';
const w = new World(4242);
const run = (s: number) => {
  for (let i = 0; i < s / CFG.dt; i++) w.step();
};
const line = (tag: string) =>
  console.log(
    `${tag.padEnd(14)} t=${w.t.toFixed(0).padStart(4)}  plants ${String(w.plants.n).padStart(4)}` +
      `  herb ${String(w.herb.n).padStart(4)}  pred ${String(w.pred.n).padStart(3)}`,
  );

run(600);
line('baseline');
if (mode === 'cull') { w.cull(KIND.PRED, 0.9); line('cull 90% pred'); }
if (mode === 'cull70') { w.cull(KIND.PRED, 0.7); line('cull 70% pred'); }
if (mode === 'rad') { CFG.env.radiation = 8; line('radiation x8'); }
if (mode === 'drought') { CFG.env.drought = 0.35; line('drought 0.35'); }
if (mode === 'heat') { CFG.env.metabolism = 2.0; line('temp 2.0'); }
if (mode === 'cold') { CFG.env.metabolism = 0.5; line('temp 0.5'); }
for (let k = 0; k < 6; k++) { run(150); line(mode); }
