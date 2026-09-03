import type { History } from '../core/history';
import { CFG, NT } from '../sim/config';

export const TRAIT_COLORS = ['#6fd0bb', '#e8b45f', '#c98adf', '#7f9ff0', '#e8809f', '#9fdc6a', '#e89858'];
const AXIS = '#1e262f';
const LABEL = '#4c5966';

export class Chart {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.fit();
  }

  fit(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = Number(this.canvas.getAttribute('height')) || r.height;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.height = this.h + 'px';
  }

  begin(): CanvasRenderingContext2D {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    return ctx;
  }
}

function fmt(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return String(Math.round(v));
}

/** Populations on a shared log axis - the standard view of predator-prey cycles. */
export function drawPopulations(c: Chart, hist: History, window: number): void {
  const ctx = c.begin();
  const padL = 26;
  const padR = 4;
  const padT = 6;
  const padB = 13;
  const gw = c.w - padL - padR;
  const gh = c.h - padT - padB;
  const from = Math.max(0, hist.len - window);
  const n = hist.len - from;

  const top = Math.max(10, hist.max(['plants', 'herb', 'pred'], window) * 1.4);
  const lgTop = Math.log10(top);
  const y = (v: number) => padT + gh * (1 - (Math.log10(Math.max(v, 1)) / lgTop));

  ctx.strokeStyle = AXIS;
  ctx.fillStyle = LABEL;
  ctx.lineWidth = 1;
  for (let e = 0; Math.pow(10, e) <= top; e++) {
    const v = Math.pow(10, e);
    const py = Math.round(y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(c.w - padR, py);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(fmt(v), padL - 5, py);
  }

  if (n < 2) return;
  const series: [string, string][] = [
    ['plants', '#57c98a'],
    ['herb', '#5fc7e8'],
    ['pred', '#ff6f5c'],
  ];
  ctx.lineJoin = 'round';
  for (const [name, color] of series) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = padL + (gw * i) / (n - 1);
      const py = y(hist.at(name, from + i));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  const span = hist.at('t', hist.len - 1) - hist.at('t', from);
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'left';
  ctx.fillText(`-${Math.round(span)} s`, padL, c.h - 6);
  ctx.textAlign = 'right';
  ctx.fillText('now', c.w - padR, c.h - 6);
}

/**
 * Prey (x) against predators (y). A Lotka-Volterra system traces a closed loop
 * here; a collapsing one spirals into a corner.
 */
export function drawPhase(c: Chart, hist: History, window: number): void {
  const ctx = c.begin();
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const gw = c.w - padL - padR;
  const gh = c.h - padT - padB;
  const from = Math.max(0, hist.len - window);
  const n = hist.len - from;
  const mx = Math.max(10, hist.max(['herb'], window) * 1.1);
  const my = Math.max(5, hist.max(['pred'], window) * 1.1);

  ctx.strokeStyle = AXIS;
  ctx.strokeRect(padL + 0.5, padT + 0.5, gw, gh);
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'right';
  ctx.fillText(fmt(my), padL - 5, padT + 4);
  ctx.fillText('0', padL - 5, padT + gh - 2);
  ctx.textAlign = 'left';
  ctx.fillText('herbivores →', padL + 1, c.h - 6);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(mx), c.w - padR, c.h - 6);
  ctx.save();
  ctx.translate(9, padT + gh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('predators →', 0, 0);
  ctx.restore();

  if (n < 2) return;
  const px = (v: number) => padL + (Math.min(v, mx) / mx) * gw;
  const py = (v: number) => padT + gh - (Math.min(v, my) / my) * gh;
  for (let i = 1; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(px(hist.at('herb', from + i - 1)), py(hist.at('pred', from + i - 1)));
    ctx.lineTo(px(hist.at('herb', from + i)), py(hist.at('pred', from + i)));
    ctx.strokeStyle = `rgba(157,185,255,${(0.06 + 0.5 * (i / n)).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const lx = px(hist.at('herb', hist.len - 1));
  const ly = py(hist.at('pred', hist.len - 1));
  ctx.beginPath();
  ctx.arc(lx, ly, 2.6, 0, 6.283185307179586);
  ctx.fillStyle = '#e8eef4';
  ctx.fill();
}

/**
 * Social structure. The aggregation index is the mean nearest-neighbour distance
 * divided by what random placement would give: below the dashed line the
 * herbivores are in herds, on it they are scattered. The second line is the
 * effective number of surviving clan markers.
 */
export function drawSocial(c: Chart, hist: History, window: number): void {
  const ctx = c.begin();
  const padL = 24;
  const padR = 22;
  const padT = 6;
  const padB = 13;
  const gw = c.w - padL - padR;
  const gh = c.h - padT - padB;
  const from = Math.max(0, hist.len - window);
  const n = hist.len - from;
  const GTOP = 2;
  const CTOP = 20;

  ctx.strokeStyle = AXIS;
  ctx.fillStyle = LABEL;
  for (const v of [0, 1, 2]) {
    const py = Math.round(padT + gh * (1 - v / GTOP)) + 0.5;
    ctx.beginPath();
    if (v === 1) ctx.setLineDash([3, 3]);
    ctx.moveTo(padL, py);
    ctx.lineTo(c.w - padR, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(0), padL - 4, py);
  }
  ctx.textAlign = 'left';
  ctx.fillText('random', padL + 2, padT + gh * 0.5 - 6);
  ctx.fillText('20', c.w - padR + 4, padT + 4);
  ctx.fillText('0', c.w - padR + 4, padT + gh - 2);
  if (n < 2) return;

  const plot = (name: string, top: number, color: string) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = Math.min(top, hist.at(name, from + i));
      const x = padL + (gw * i) / (n - 1);
      const y = padT + gh * (1 - v / top);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  };
  plot('group', GTOP, '#5fc7e8');
  plot('clans', CTOP, '#c98adf');
}

/** Mean heritable traits, each normalised to its own allowed range. */
export function drawTraits(c: Chart, hist: History, sp: 'herb' | 'pred', window: number): void {
  const ctx = c.begin();
  const padL = 22;
  const padR = 4;
  const padT = 6;
  const padB = 13;
  const gw = c.w - padL - padR;
  const gh = c.h - padT - padB;
  const from = Math.max(0, hist.len - window);
  const n = hist.len - from;
  const prefix = sp === 'herb' ? 'hT' : 'pT';
  const defs = (sp === 'herb' ? CFG.herb : CFG.pred).traits;

  ctx.strokeStyle = AXIS;
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'right';
  for (const f of [0, 0.5, 1]) {
    const py = Math.round(padT + gh * (1 - f)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(c.w - padR, py);
    ctx.stroke();
    ctx.fillText(f === 0.5 ? 'mid' : f === 1 ? 'max' : 'min', padL - 4, py);
  }
  if (n < 2) return;

  for (let k = 0; k < NT; k++) {
    const d = defs[k];
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const raw = hist.at(prefix + k, from + i);
      const f = (raw - d.min) / (d.max - d.min);
      const x = padL + (gw * i) / (n - 1);
      const yy = padT + gh * (1 - Math.min(1, Math.max(0, f)));
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = TRAIT_COLORS[k];
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }
}
