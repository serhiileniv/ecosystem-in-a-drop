/**
 * Uniform spatial hash over a fixed square region, rebuilt every tick by counting
 * sort. Backing storage is Int32Array only - no objects, no allocation per tick.
 *
 * Usage:
 *   grid.build(xs, ys, n);
 *   const c0 = grid.cellFloorX(px - r), ... iterate cells, then
 *   for (k = start[c]; k < start[c] + count[c]; k++) j = order[k];
 */
export class Grid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minY: number;
  readonly count: Int32Array;
  readonly start: Int32Array;
  order: Int32Array;

  constructor(minX: number, minY: number, size: number, cell: number, capacity: number) {
    this.cell = cell;
    this.minX = minX;
    this.minY = minY;
    this.cols = Math.max(1, Math.ceil(size / cell));
    this.rows = this.cols;
    this.count = new Int32Array(this.cols * this.rows);
    this.start = new Int32Array(this.cols * this.rows + 1);
    this.order = new Int32Array(capacity);
  }

  cx(x: number): number {
    const c = ((x - this.minX) / this.cell) | 0;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  cy(y: number): number {
    const c = ((y - this.minY) / this.cell) | 0;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  build(xs: Float32Array, ys: Float32Array, n: number): void {
    if (this.order.length < n) this.order = new Int32Array(n * 2);
    const { count, start, cols } = this;
    count.fill(0);
    for (let i = 0; i < n; i++) count[this.cy(ys[i]) * cols + this.cx(xs[i])]++;
    let acc = 0;
    for (let c = 0; c < count.length; c++) {
      start[c] = acc;
      acc += count[c];
    }
    start[count.length] = acc;
    // reuse count as a write cursor
    count.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cy(ys[i]) * cols + this.cx(xs[i]);
      this.order[start[c] + count[c]++] = i;
    }
  }
}
