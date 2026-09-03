/** Same seed + same tick count must give a bit-identical world. */
import { World } from '../src/sim/world';

function fingerprint(seed: number, ticks: number): string {
  const w = new World(seed);
  for (let i = 0; i < ticks; i++) w.step();
  let h = 0;
  const mix = (v: number) => (h = (Math.imul(h ^ (v | 0), 0x9e3779b1) + 0x85ebca6b) | 0);
  mix(w.plants.n); mix(w.herb.n); mix(w.pred.n); mix(Math.round(w.soil * 1000));
  for (let i = 0; i < w.herb.n; i++) mix(Math.round(w.herb.x[i] * 1000) ^ w.herb.uid[i]);
  for (let i = 0; i < w.pred.n; i++) mix(Math.round(w.pred.energy[i] * 1000) ^ w.pred.gen[i]);
  return `${w.plants.n}/${w.herb.n}/${w.pred.n} soil=${w.soil.toFixed(3)} h=${h}`;
}

const a = fingerprint(777, 12000);
const b = fingerprint(777, 12000);
const c = fingerprint(778, 12000);
console.log('run A  ', a);
console.log('run B  ', b);
console.log('seed+1 ', c);
console.log(a === b ? 'PASS reproducible' : 'FAIL not reproducible');
console.log(a !== c ? 'PASS seed matters' : 'FAIL seed ignored');
