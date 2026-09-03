import type { Chart } from './charts';
import { NIN, NHID, NOUT, NW, W1, W2, SECTORS } from '../sim/brain';
import { KIND } from '../sim/world';
import { CLR } from './view';

const OUT_LABELS = ['thrust', 'turn', 'ready', 'court'];
const GROUP_LABELS = ['food', 'kin', 'risk', 'mate'];
const MATE_COLOR = '232,144,178';

function actColor(v: number): string {
  // negative = cool, positive = warm, magnitude = opacity
  const m = Math.min(1, Math.abs(v));
  return v >= 0
    ? `rgba(157,185,255,${(0.12 + 0.88 * m).toFixed(3)})`
    : `rgba(255,140,110,${(0.12 + 0.88 * m).toFixed(3)})`;
}

/**
 * The selected creature's network: 23 sensory inputs, 8 hidden units, 4 motor
 * outputs. Edge opacity is |weight|, edge colour its sign; node fill is the
 * live activation of the last tick.
 */
export function drawNet(
  c: Chart,
  W: Float32Array | null,
  off: number,
  inp: Float32Array,
  hid: Float32Array,
  out: Float32Array,
  kind: number,
): void {
  const ctx = c.begin();
  if (!W) {
    ctx.fillStyle = '#3d4954';
    ctx.textAlign = 'center';
    ctx.fillText('—', c.w / 2, c.h / 2);
    return;
  }
  const padT = 10;
  const padB = 10;
  const xi = 34;
  const xh = c.w * 0.52;
  const xo = c.w - 52;
  const gh = c.h - padT - padB;
  const yi = (k: number) => padT + (gh * (k + 0.5)) / NIN;
  const yh = (k: number) => padT + (gh * (k + 0.5)) / NHID;
  const yo = (k: number) => padT + (gh * (k + 0.5)) / NOUT;

  // ---- edges
  ctx.lineWidth = 1;
  for (let h = 0; h < NHID; h++) {
    const row = off + W1 + h * NIN;
    for (let i = 0; i < NIN; i++) {
      const w = W[row + i];
      const a = Math.min(1, Math.abs(w) / 1.6);
      if (a < 0.16) continue;
      ctx.beginPath();
      ctx.moveTo(xi, yi(i));
      ctx.lineTo(xh, yh(h));
      ctx.strokeStyle = w > 0 ? `rgba(120,170,255,${(a * a * 0.55).toFixed(3)})` : `rgba(255,130,100,${(a * a * 0.55).toFixed(3)})`;
      ctx.stroke();
    }
  }
  for (let o = 0; o < NOUT; o++) {
    const row = off + W2 + o * NHID;
    for (let h = 0; h < NHID; h++) {
      const w = W[row + h];
      const a = Math.min(1, Math.abs(w) / 1.6);
      if (a < 0.16) continue;
      ctx.beginPath();
      ctx.moveTo(xh, yh(h));
      ctx.lineTo(xo, yo(o));
      ctx.strokeStyle = w > 0 ? `rgba(120,170,255,${(a * a * 0.7).toFixed(3)})` : `rgba(255,130,100,${(a * a * 0.7).toFixed(3)})`;
      ctx.stroke();
    }
  }

  // ---- input nodes, coloured by the channel they report
  const chan =
    kind === KIND.PRED
      ? [CLR.herb, CLR.pred, CLR.plant, MATE_COLOR]
      : [CLR.plant, CLR.herb, CLR.pred, MATE_COLOR];
  for (let i = 0; i < NIN; i++) {
    const ch = i < 4 * SECTORS ? (i / SECTORS) | 0 : -1;
    const v = Math.min(1, inp[i]);
    ctx.beginPath();
    ctx.arc(xi, yi(i), 2.6, 0, 6.283185307179586);
    ctx.fillStyle = ch >= 0 ? `rgba(${chan[ch]},${(0.14 + 0.86 * v).toFixed(3)})` : actColor(v);
    ctx.fill();
  }
  ctx.fillStyle = '#4c5966';
  ctx.textAlign = 'right';
  for (let g = 0; g < 4; g++) ctx.fillText(GROUP_LABELS[g], xi - 7, yi(g * SECTORS + 2));
  ctx.fillText('E', xi - 7, yi(4 * SECTORS));
  ctx.fillText('n', xi - 7, yi(4 * SECTORS + 1));
  ctx.fillText('1', xi - 7, yi(4 * SECTORS + 2));

  // ---- hidden + output nodes
  for (let h = 0; h < NHID; h++) {
    ctx.beginPath();
    ctx.arc(xh, yh(h), 3.4, 0, 6.283185307179586);
    ctx.fillStyle = actColor(hid[h]);
    ctx.fill();
  }
  ctx.textAlign = 'left';
  for (let o = 0; o < NOUT; o++) {
    ctx.beginPath();
    ctx.arc(xo, yo(o), 4, 0, 6.283185307179586);
    ctx.fillStyle = actColor(out[o]);
    ctx.fill();
    ctx.fillStyle = '#8a99a8';
    ctx.fillText(OUT_LABELS[o], xo + 8, yo(o) - 5);
    ctx.fillStyle = '#4c5966';
    ctx.fillText(out[o].toFixed(2), xo + 8, yo(o) + 5);
  }
}

export const NET_STRIDE = NW;
