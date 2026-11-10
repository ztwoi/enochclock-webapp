// The transport's state, apart from the DOM: which unit plays (day or degree; year on Deep Time), and for
// each its own remembered speed and direction. Persisted, so it carries across views, pages and reloads.
export type Mode = 'degree' | 'day' | 'year';
export type Dir = 1 | -1;
/** The units the reader chooses between; Year is the unit of Deep Time alone (the view sets it, it is not remembered as the choice). */
export const MODES: Mode[] = ['day', 'degree'];
export const SPEEDS = [0.5, 1, 2, 4, 8, 16];
/** Each unit at 1×, a second: Day 30 days (a new day every frame at 30 frames a second, so none is skipped; faster skips),
 *  Degree 15° (an hour of the day), Year 1 (Deep Time). */
export const PER_SECOND: Record<Mode, number> = { day: 30, degree: 15, year: 1 };
/** ◀◀ ▶▶ (and the arrow keys) step the unit times the speed: 4° at 4×, 16 days at 16×; never less than one unit (0.5× steps 1). */
export const stepUnits = (speed: number) => Math.max(1, Math.abs(speed));
export const KEY = 'enoch.transport.v3';
/** v2 ran Day at 2 days a second at 1× (its 16× was 32 a second, today's 1×): a Day speed remembered under it starts again at 1×. */
const KEY_V2 = 'enoch.transport.v2';
export interface TransportState { mode: 'day' | 'degree'; day: { speed: number; dir: Dir }; degree: { speed: number; dir: Dir }; year: { speed: number; dir: Dir } }
export const defaults = (): TransportState => ({ mode: 'degree', day: { speed: 1, dir: 1 }, degree: { speed: 1, dir: 1 }, year: { speed: 1, dir: 1 } });

/** The next speed on the button: 0.5× → 1× → 2× → 4× → 8× → 16× → 0.5×. */
export const nextSpeed = (v: number) => SPEEDS[(SPEEDS.indexOf(v) + 1) % SPEEDS.length];
export const fmtSpeed = (v: number) => `${Math.abs(v)}×`;

export function loadState(store: Pick<Storage, 'getItem'> = localStorage): TransportState {
  const d = defaults();
  try {
    const v3 = store.getItem(KEY), v2 = v3 === null ? store.getItem(KEY_V2) : null;
    const o = JSON.parse(v3 ?? v2 ?? '{}') ?? {};
    if (v2 !== null && o && typeof o === 'object') delete o.day;  // Day's old speed meant 15 times less: back to 1×, its direction too
    const one = (x: unknown, fb: TransportState['day']) => {
      const r = (x ?? {}) as { speed?: unknown; dir?: unknown };
      return { speed: SPEEDS.includes(r.speed as number) ? (r.speed as number) : fb.speed, dir: (r.dir === -1 ? -1 : 1) as Dir };
    };
    return { mode: o.mode === 'day' ? 'day' : 'degree', day: one(o.day, d.day), degree: one(o.degree, d.degree), year: one(o.year, d.year) };
  } catch { return d; }
}
