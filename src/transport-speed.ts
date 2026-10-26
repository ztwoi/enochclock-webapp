// The transport's state, apart from the DOM: which unit plays (day or degree; year on Deep Time), and for
// each its own remembered speed and direction. Persisted, so it carries across views, pages and reloads.
export type Mode = 'degree' | 'day' | 'year';
export type Dir = 1 | -1;
/** The units the reader chooses between; Year is the unit of Deep Time alone (the view sets it, it is not remembered as the choice). */
export const MODES: Mode[] = ['day', 'degree'];
export const SPEEDS = [0.5, 1, 2, 4, 16];
export const KEY = 'enoch.transport.v2';
export interface TransportState { mode: 'day' | 'degree'; day: { speed: number; dir: Dir }; degree: { speed: number; dir: Dir }; year: { speed: number; dir: Dir } }
export const defaults = (): TransportState => ({ mode: 'degree', day: { speed: 1, dir: 1 }, degree: { speed: 1, dir: 1 }, year: { speed: 1, dir: 1 } });

/** The next speed on the button: 0.5× → 1× → 2× → 4× → 16× → 0.5×. */
export const nextSpeed = (v: number) => SPEEDS[(SPEEDS.indexOf(v) + 1) % SPEEDS.length];
export const fmtSpeed = (v: number) => `${Math.abs(v)}×`;

export function loadState(store: Pick<Storage, 'getItem'> = localStorage): TransportState {
  const d = defaults();
  try {
    const o = JSON.parse(store.getItem(KEY) ?? '{}') ?? {};
    const one = (x: unknown, fb: TransportState['day']) => {
      const r = (x ?? {}) as { speed?: unknown; dir?: unknown };
      return { speed: SPEEDS.includes(r.speed as number) ? (r.speed as number) : fb.speed, dir: (r.dir === -1 ? -1 : 1) as Dir };
    };
    return { mode: o.mode === 'day' ? 'day' : 'degree', day: one(o.day, d.day), degree: one(o.degree, d.degree), year: one(o.year, d.year) };
  } catch { return d; }
}
