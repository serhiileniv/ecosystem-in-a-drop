import { CFG, NT, TR } from '../sim/config';
import { KIND, type World } from '../sim/world';
import { SECTORS } from '../sim/brain';

export const CLR = {
  plant: '87,201,138',
  herb: '95,199,232',
  pred: '255,111,92',
};

/** four energy tiers per species, so a whole population is drawn in four fills */
const TIERS = 4;
/** clan-marker hue bins: herbivores are tinted by lineage so tribes are visible */
export const CLANS = 6;
function ramp(rgb: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < TIERS; i++) out.push(`rgba(${rgb},${(0.36 + 0.21 * i).toFixed(2)})`);
  return out;
}
const plantRamp = (() => {
  const out: string[] = [];
  for (let i = 0; i < TIERS; i++) out.push(`rgba(${CLR.plant},${(0.5 + 0.16 * i).toFixed(2)})`);
  return out;
})();
const herbRamp = ramp(CLR.herb);

/**
 * Herbivore fills: `CLANS` hues rotated around the species colour, each at
 * `TIERS` energy levels. The rotation is deliberately narrow - a clan should read
 * as a shade of "herbivore", never as a different species.
 */
export function clanColor(tag: number, alpha: number): string {
  // a narrow rotation around the species hue: a clan reads as a shade of
  // "herbivore", never as a different animal
  const hue = 191 + (((tag * CLANS) | 0) / (CLANS - 1) - 0.5) * 58;
  return `hsla(${hue.toFixed(0)},68%,66%,${alpha})`;
}
const herbClanRamp: string[][] = [];
for (let cl = 0; cl < CLANS; cl++) {
  const row: string[] = [];
  for (let t = 0; t < TIERS; t++) row.push(clanColor((cl + 0.5) / CLANS, 0.36 + 0.21 * t));
  herbClanRamp.push(row);
}
const predRamp = ramp(CLR.pred);

export interface Selection {
  kind: number;
  index: number;
}

export class DishView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  showVision = true;
  showClans = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const R = CFG.world.radius;
    this.scale = (Math.min(r.width, r.height) * 0.5 - 18) / R;
    this.ox = r.width * 0.5;
    this.oy = r.height * 0.5;
  }

  toWorld(cx: number, cy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (cx - r.left - this.ox) / this.scale,
      y: (cy - r.top - this.oy) / this.scale,
    };
  }

  draw(world: World, sel: Selection): void {
    const { ctx, scale, ox, oy } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#080a0c';
    ctx.fillRect(0, 0, this.w, this.h);

    // ---- the dish
    const R = CFG.world.radius * scale;
    const g = ctx.createRadialGradient(ox, oy, R * 0.15, ox, oy, R);
    g.addColorStop(0, '#0f151b');
    g.addColorStop(1, '#0a0e13');
    ctx.beginPath();
    ctx.arc(ox, oy, R, 0, 6.283185307179586);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#1b242d';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, R, 0, 6.283185307179586);
    ctx.clip();

    // ---- vegetation
    const P = world.plants;
    const emaxP = CFG.plant.maxEnergy;
    for (let t = 0; t < TIERS; t++) {
      ctx.beginPath();
      let drew = false;
      for (let i = 0; i < P.n; i++) {
        const f = P.e[i] / emaxP;
        let tier = (f * TIERS) | 0;
        if (tier > TIERS - 1) tier = TIERS - 1;
        if (tier !== t) continue;
        const s = Math.max(1.8, (2.0 + 2.6 * f) * scale);
        ctx.rect(ox + P.x[i] * scale - s * 0.5, oy + P.y[i] * scale - s * 0.5, s, s);
        drew = true;
      }
      if (drew) {
        ctx.fillStyle = plantRamp[t];
        ctx.fill();
      }
    }

    // ---- animals
    if (this.showClans) {
      for (let cl = 0; cl < CLANS; cl++) this.drawPop(world, KIND.HERB, herbClanRamp[cl], cl);
    } else {
      this.drawPop(world, KIND.HERB, herbRamp, -1);
    }
    this.drawPop(world, KIND.PRED, predRamp, -1);

    // ---- selection
    if (sel.index >= 0) {
      const p = sel.kind === KIND.PRED ? world.pred : world.herb;
      if (sel.index < p.n) this.drawSelected(p, sel.index, sel.kind);
    }
    ctx.restore();
  }

  private drawPop(world: World, kind: number, ramps: string[], clan: number): void {
    const { ctx, scale, ox, oy } = this;
    const p = kind === KIND.PRED ? world.pred : world.herb;
    const cd = Math.cos(2.42);
    const sd = Math.sin(2.42);
    for (let t = 0; t < TIERS; t++) {
      ctx.beginPath();
      let drew = false;
      for (let i = 0; i < p.n; i++) {
        if (clan >= 0 && ((p.tag[i] * CLANS) | 0) !== clan) continue;
        const f = p.energy[i] / p.emax[i];
        let tier = (f * TIERS) | 0;
        if (tier > TIERS - 1) tier = TIERS - 1;
        else if (tier < 0) tier = 0;
        if (tier !== t) continue;
        const size = p.T[i * NT + TR.SIZE];
        const r = Math.max(2.2, 4.4 * size * scale);
        const ca = Math.cos(p.ang[i]);
        const sa = Math.sin(p.ang[i]);
        const x = ox + p.x[i] * scale;
        const y = oy + p.y[i] * scale;
        // rotate +-2.55 rad around the heading without extra trig calls
        const lx = ca * cd - sa * sd;
        const ly = sa * cd + ca * sd;
        const rx = ca * cd + sa * sd;
        const ry = sa * cd - ca * sd;
        ctx.moveTo(x + ca * r * 2.05, y + sa * r * 2.05);
        ctx.lineTo(x + lx * r, y + ly * r);
        ctx.lineTo(x + rx * r, y + ry * r);
        drew = true;
      }
      if (drew) {
        ctx.fillStyle = ramps[t];
        ctx.fill();
      }
    }
  }

  private drawSelected(
    p: { x: Float32Array; y: Float32Array; ang: Float32Array; T: Float32Array },
    i: number,
    kind: number,
  ): void {
    const { ctx, scale, ox, oy } = this;
    const x = ox + p.x[i] * scale;
    const y = oy + p.y[i] * scale;
    const tb = i * NT;
    const size = p.T[tb + TR.SIZE];
    const sense = p.T[tb + TR.SENSE] * scale;
    const fov = p.T[tb + TR.FOV];
    const a = p.ang[i];
    const tint = kind === KIND.PRED ? CLR.pred : CLR.herb;

    if (this.showVision) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, sense, a - fov / 2, a + fov / 2);
      ctx.closePath();
      ctx.fillStyle = `rgba(${tint},0.045)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${tint},0.16)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      // sector separators - these are literally the network's input channels
      ctx.beginPath();
      for (let s = 1; s < SECTORS; s++) {
        const sa2 = a - fov / 2 + (fov * s) / SECTORS;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(sa2) * sense, y + Math.sin(sa2) * sense);
      }
      ctx.strokeStyle = `rgba(${tint},0.08)`;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, Math.max(7, 4.4 * size * scale + 5), 0, 6.283185307179586);
    ctx.strokeStyle = '#e8eef4';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
