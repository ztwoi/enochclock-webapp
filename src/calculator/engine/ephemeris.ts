import Swiss from 'sweph-wasm';

type Wasm = {
  [name: `_swe_${string}`]: (...args: number[]) => number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  setValue(ptr: number, value: number, type: string): void;
  getValue(ptr: number, type: string): number;
  UTF8ToString(ptr: number): string;
  stringToUTF8(value: string, ptr: number, size: number): void;
  FS: { mkdir(path: string): void; writeFile(path: string, bytes: Uint8Array): void };
};
export type EphemerisFile = { name: string; bytes: Uint8Array; sha256: string };
export type Position = { values: number[]; flags: number; warning?: string };

/** Each instance owns a separate Emscripten module, filesystem, and Swiss C globals.
 * No module pooling or shared engine state: topocentre and close cannot affect peers.
 * The bundler must serve sweph-wasm's wasm/swisseph.wasm beside its JS entry.
 */
export class StrictSwiss {
  private closed = false;
  private backendFailure: Error | undefined;
  private constructor(private readonly wasm: Wasm) {}

  static async create(files: EphemerisFile[]): Promise<StrictSwiss> {
    // Snapshot synchronously before any await: callers cannot mutate verified bytes
    // between digesting them and writing them into the module filesystem.
    if (!Array.isArray(files)) throw new TypeError('files must be an array');
    const seen = new Set<string>();
    const snapshots = files.map(file => {
      if (!file || !/^se[a-z0-9_]+\.se1$/.test(file.name)) throw new Error('Invalid ephemeris basename');
      if (seen.has(file.name)) throw new Error(`Duplicate ephemeris file: ${file.name}`);
      seen.add(file.name);
      if (!(file.bytes instanceof Uint8Array) || !file.bytes.length) throw new Error(`Empty or invalid ephemeris file: ${file.name}`);
      if (!/^[a-fA-F0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid SHA-256: ${file.name}`);
      return {...file, bytes: new Uint8Array(file.bytes)};
    });
    for (const file of snapshots) {
      const digest = await crypto.subtle.digest('SHA-256', file.bytes);
      const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256.toLowerCase()) throw new Error(`SHA-256 mismatch: ${file.name}`);
    }
    const engine = await Swiss.init();
    const s = new StrictSwiss((engine as unknown as { wasm: Wasm }).wasm);
    try {
      s.wasm.FS.mkdir('/ephe');
      for (const file of snapshots) s.wasm.FS.writeFile('/ephe/' + file.name, file.bytes);
      s.memory([6], ([p]) => { s.wasm.stringToUTF8('/ephe', p, 6); s.wasm._swe_set_ephe_path(p); });
      return s;
    } catch (error) { s.close(); throw error; }
  }

  private memory<T>(sizes: number[], run: (ptrs: number[]) => T): T {
    this.open();
    const ptrs: number[] = [];
    try {
      for (const size of sizes) {
        const p = this.wasm._malloc(size);
        if (!p) throw new Error('Swiss WASM allocation failed');
        ptrs.push(p);
        for (let i = 0; i < size; i++) this.wasm.setValue(p + i, 0, 'i8');
      }
      return run(ptrs);
    } finally { for (const p of ptrs.reverse()) this.wasm._free(p); }
  }
  private read(p: number, count: number): number[] {
    return Array.from({length: count}, (_, i) => this.wasm.getValue(p + i * 8, 'double'));
  }
  calcUt(jd: number, body: number, flags: number): Position { return this.calc(jd, body, flags, false); }
  calcTt(jd: number, body: number, flags: number): Position { return this.calc(jd, body, flags, true); }
  private calc(jd: number, body: number, flags: number, tt: boolean): Position {
    this.date(jd); this.integer(body, 'body', 0, 1000000); this.flags(flags);
    return this.memory([48, 256], ([x, e]) => {
      const returned = this.wasm[tt ? '_swe_calc' : '_swe_calc_ut'](jd, body, flags, x, e);
      const warning = this.wasm.UTF8ToString(e);
      // Swiss can return SWIEPH bits while using a Moshier Moon internally.
      // Its warning is part of the backend contract, not merely a diagnostic.
      const fallback = (returned >= 0 && (returned & 7) !== 2) || /moshier|not found|not available|using .*eph/i.test(warning);
      if (returned < 0 || fallback) {
        const error = new Error(`Strict Swiss calculation failed; missing/unsupported ephemeris data or backend (flags ${returned}): ${warning}`);
        // A failed call can cache fallback positions whose next call has no warning.
        // With an immutable file set, poison this instance rather than trust that cache.
        if (returned >= 0 && fallback) this.backendFailure = error;
        throw error;
      }
      return { values: this.read(x, 6), flags: returned, ...(warning ? {warning} : {}) };
    });
  }
  julday(year: number, month: number, day: number, hour: number, calendar = 1): number {
    this.open(); this.integer(year, 'year', -100000, 100000); this.integer(month, 'month', 1, 12);
    this.integer(day, 'day', 1, 31); this.finite(hour, 'hour', 0, 24); this.integer(calendar, 'calendar', 0, 1);
    if (hour === 24) throw new RangeError('Invalid hour: use next day at 0');
    const jd = this.wasm._swe_julday(year, month, day, hour, calendar);
    const back = this.revjul(this.wasm._swe_julday(year, month, day, 0, calendar), calendar);
    if (back[0] !== year || back[1] !== month || back[2] !== day) throw new RangeError('Invalid calendar date');
    return jd;
  }
  revjul(jd: number, calendar = 1): number[] {
    this.date(jd); this.integer(calendar, 'calendar', 0, 1);
    return this.memory([4, 4, 4, 8], ([y, m, d, h]) => {
      this.wasm._swe_revjul(jd, calendar, y, m, d, h);
      return [y, m, d].map(p => this.wasm.getValue(p, 'i32')).concat(this.wasm.getValue(h, 'double'));
    });
  }
  setTopo(lon: number, lat: number, elevation: number): void {
    this.location([lon, lat, elevation]);
    this.wasm._swe_set_topo(lon, lat, elevation);
  }
  private put(p: number, values: number[]): void {
    values.forEach((v, i) => this.wasm.setValue(p + i * 8, v, 'double'));
  }
  /** Swiss azimuth convention is retained: south=0, west=90 (not north=0). */
  azalt(jd: number, flag: number, geo: [number, number, number], pressure: number, temp: number, values: number[]): number[] {
    this.date(jd); this.integer(flag, 'azalt flag', 0, 1); this.location(geo); this.weather(pressure, temp);
    if (!Array.isArray(values) || values.length !== 3) throw new RangeError('Invalid coordinates: expected three numbers');
    values.forEach(v => this.finite(v, 'coordinate'));
    return this.memory([24, 24, 24], ([g, v, out]) => {
      this.put(g, geo); this.put(v, values);
      this.wasm._swe_azalt(jd, flag, g, pressure, temp, v, out);
      return this.read(out, 3);
    });
  }
  riseTrans(jd: number, body: number, rsmi: number, geo: [number, number, number], pressure: number, temp: number): {status: number; jd: number | null} {
    this.date(jd); this.integer(rsmi, 'rise/transit mode', 1, 65535); this.location(geo); this.weather(pressure, temp);
    if (![1, 2, 4, 8].includes(rsmi & 15)) throw new RangeError('Invalid rise/transit event bits');
    // Rise's return value is a status, NOT backend flags. Independently check
    // both ends of its search window, including lunar data used for Delta T.
    for (const t of [jd, jd + 2]) { this.calcUt(t, body, 2); this.calcUt(t, 1, 2); }
    return this.memory([24, 8, 256], ([g, out, e]) => {
      this.put(g, geo);
      const status = this.wasm._swe_rise_trans(jd, body, 0, 2, rsmi, g, pressure, temp, out, e);
      const message = this.wasm.UTF8ToString(e);
      if (status === -2) return {status, jd: null};
      if (status !== 0 || message) throw new Error(`Strict Swiss rise/set failed (${status}): ${message}`);
      const event = this.read(out, 1)[0];
      this.calcUt(event, body, 2);
      return {status, jd: event};
    });
  }
  /** Full 20-element native attribute array (first five are phase/illumination/etc). */
  phenoUt(jd: number, body: number, flags: number): number[] {
    this.calcUt(jd, body, flags); this.calcUt(jd, 0, 2); this.calcUt(jd, 1, 2);
    return this.memory([160, 256], ([out, e]) => {
      const status = this.wasm._swe_pheno_ut(jd, body, flags, out, e);
      const message = this.wasm.UTF8ToString(e);
      if (status < 0 || message) throw new Error(`Strict Swiss phenomena failed (${status}): ${message}`);
      return this.read(out, 20);
    });
  }
  deltat(jd: number): number {
    this.calcUt(jd, 0, 2); this.calcUt(jd, 1, 2);
    return this.memory([256], ([e]) => {
      const value = this.wasm._swe_deltat_ex(jd, 2, e);
      const message = this.wasm.UTF8ToString(e);
      if (message) throw new Error(`Strict Swiss Delta T failed: ${message}`);
      return value;
    });
  }
  private open(): void {
    if (this.closed) throw new Error('StrictSwiss instance is closed');
    if (this.backendFailure) throw this.backendFailure;
  }
  private finite(value: number, name: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): void {
    if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${name}: ${value}`);
  }
  private integer(value: number, name: string, min: number, max: number): void {
    this.finite(value, name, min, max);
    if (!Number.isInteger(value)) throw new RangeError(`Invalid ${name}: expected integer`);
  }
  private date(jd: number): void { this.open(); this.finite(jd, 'Julian date', -40000000, 40000000); }
  private flags(flags: number): void {
    this.integer(flags, 'flags', 0, 2147483647);
    if ((flags & 7) !== 2) throw new RangeError('SWIEPH (2) must be the sole requested ephemeris backend');
  }
  private location(geo: [number, number, number]): void {
    this.open();
    if (!Array.isArray(geo) || geo.length !== 3) throw new RangeError('Invalid geographic coordinates');
    this.finite(geo[0], 'longitude', -180, 180); this.finite(geo[1], 'latitude', -90, 90);
    this.finite(geo[2], 'elevation', -12000, 100000);
  }
  private weather(pressure: number, temp: number): void {
    this.finite(pressure, 'pressure', 0, 2000); this.finite(temp, 'temperature', -273, 1000);
  }
  close(): void {
    if (!this.closed) { this.wasm._swe_close(); this.closed = true; }
  }
}
