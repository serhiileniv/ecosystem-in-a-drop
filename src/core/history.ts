/** Fixed-capacity ring buffer of named scalar series. */
export class History {
  readonly cap: number;
  readonly names: string[];
  private data: Record<string, Float32Array> = {};
  len = 0;
  head = 0; // index of the next write

  constructor(names: string[], cap = 3000) {
    this.cap = cap;
    this.names = names;
    for (const n of names) this.data[n] = new Float32Array(cap);
  }

  push(row: Record<string, number>): void {
    for (const n of this.names) this.data[n][this.head] = row[n] ?? 0;
    this.head = (this.head + 1) % this.cap;
    if (this.len < this.cap) this.len++;
  }

  /** value at logical position i (0 = oldest kept sample) */
  at(name: string, i: number): number {
    const a = this.data[name];
    const start = (this.head - this.len + this.cap) % this.cap;
    return a[(start + i) % this.cap];
  }

  last(name: string): number {
    return this.len ? this.at(name, this.len - 1) : 0;
  }

  /** max over the most recent `window` samples (window <= 0 => all) */
  max(names: string[], window = 0): number {
    const from = window > 0 ? Math.max(0, this.len - window) : 0;
    let m = 0;
    for (const n of names) for (let i = from; i < this.len; i++) m = Math.max(m, this.at(n, i));
    return m;
  }

  clear(): void {
    this.len = 0;
    this.head = 0;
  }

  toCsv(): string {
    const out: string[] = [this.names.join(',')];
    for (let i = 0; i < this.len; i++) {
      const row: string[] = [];
      for (const n of this.names) {
        const v = this.at(n, i);
        row.push(Number.isInteger(v) ? String(v) : v.toFixed(4));
      }
      out.push(row.join(','));
    }
    return out.join('\n');
  }
}
