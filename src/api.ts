// Calculations (on this device), Deep Time (static files) and observer selection. Nothing here talks to a server of ours.
import type { DeepDoc, Site } from './types';
import type { DeepSeries } from './deepplot';
import {localRequest} from './calculator/provider';
import {parseIsoDate} from './calculator/engine/calendar';
import type {Instant} from './calculator/protocol';
import {locate} from './geo/location';

export const PRESETS: Site[] = [
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, elev: 0, tz: 'America/Los_Angeles', source: 'preset' },
  { name: 'Jerusalem', lat: 31.7784, lon: 35.2354, elev: 800, tz: 'Asia/Jerusalem', source: 'preset' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, elev: 0, tz: 'Australia/Sydney', source: 'preset' },
  { name: 'London', lat: 51.5074, lon: -0.1278, elev: 0, tz: 'Europe/London', source: 'preset' },
];
export const FALLBACK = PRESETS[0];
const KEY = 'enoch.site.v1';

export const fetchYearContaining = (s: Site, date: string) => localRequest({kind:'year',selector:{date:parseIsoDate(date)},site:s});
export const fetchGregorianYear = (s: Site, year: number) => localRequest({kind:'year',selector:{year},site:s});
export const fetchEnochYear = (s: Site, enochYear: number) => localRequest({kind:'year',selector:{enoch_year:enochYear},site:s});
export const fetchInstant = (s:Site,jd:number):Promise<Instant> => localRequest({kind:'instant',jd,site:s});

export function savedSite(): Site | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return s && typeof s.lat === 'number' ? s : null; } catch { return null; }
}
export const saveSite = (s: Site) => localStorage.setItem(KEY, JSON.stringify(s));
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The device's position as a site, named for what it is: here. Rejects with a LocateError (src/geo/location.ts). */
export const HERE = 'Here';
export async function deviceSite(): Promise<Site> {
  const f = await locate();
  return { name: HERE, lat: +f.lat.toFixed(4), lon: +f.lon.toFixed(4), elev: Math.round(f.elev), tz: browserZone(), source: 'device' };
}

// Deep Time: precomputed static files, served from /deep/.
const DEEP = `${import.meta.env.BASE_URL}deep/`, CHUNK_YEARS = 1000;
const deepFiles = new Map<string, Promise<unknown>>();
function deepFile<T>(name: string): Promise<T> {
  let p = deepFiles.get(name);
  if (!p) {
    p = fetch(DEEP + name).then((r) => { if (!r.ok) throw Error(`Deep Time data unavailable: ${name} (HTTP ${r.status})`); return r.json(); });
    p.catch(() => deepFiles.delete(name));                       // a failed file is asked for again next time
    deepFiles.set(name, p);
  }
  return p as Promise<T>;
}
export const fetchDeepSeries = () => deepFile<DeepSeries>('series.json');
const chunkName = (start: number) => `rows-${start < 0 ? 'm' : ''}${Math.abs(start)}.json`;
/** Stats and bins for every year, and the per-year rows of [start, end] (clipped to the dataset), as /api/v1/deep answered. */
export async function fetchDeep(start: number, end: number): Promise<DeepDoc> {
  const head = await deepFile<Omit<DeepDoc, 'window'>>('head-100.json');
  const lo = Math.max(start, head.stats.first_year), hi = Math.min(end, head.stats.last_year), chunks: Promise<NonNullable<DeepDoc['window']>['rows']>[] = [];
  for (let c = Math.floor(lo / CHUNK_YEARS) * CHUNK_YEARS; c <= hi; c += CHUNK_YEARS) chunks.push(deepFile(chunkName(c)));
  const rows = (await Promise.all(chunks)).flat().filter((r) => r.year >= lo && r.year <= hi);
  return { ...head, window: { start, end, rows } };
}
