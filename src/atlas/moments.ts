// Moments (docs/atlas.md, A.7): a saved place, instant, or both, with a name, a description, a colour and tags. Kept on this
// device only (localStorage); each one is also a link (?lat&lon&elev&tz&name&at#atlas), and the list exports and imports as
// JSON. Pure but for the storage, so the tests run it.

export interface MomentPlace { name: string; lat: number; lon: number; elev: number; tz: string }
export interface Moment {
  id: string; name: string; desc: string; color: string; tags: string[];
  /** The place (none: the moment keeps the place on show). */
  place: MomentPlace | null;
  /** The instant, as an ISO UT time (years beyond 0–9999 in the extended ±YYYYYY form; none: the moment keeps the time on show). */
  at: string | null;
  /** When it was saved (ISO). */
  saved: string;
}
export const COLOURS = ['#d6b26a', '#8fb3bd', '#a8875a', '#a03a30', '#6f9a63', '#ece3cf', '#7a6aa8', '#c9783f'];
const KEY = 'enoch.moments.v1';

/** An instant (Julian day, UT) as the moment keeps it, to the second. */
export const isoAt = (jd: number) => new Date(Math.round((jd - 2440587.5) * 86400) * 1000).toISOString();
export const jdAt = (iso: string) => Date.parse(iso) / 86400000 + 2440587.5;

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown, max = 2000) => (typeof x === 'string' ? x.slice(0, max) : '');
/** A moment from untrusted JSON (storage, an imported file), or null when it is not one. */
export function cleanMoment(x: unknown): Moment | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>, p = o.place as Record<string, unknown> | null | undefined;
  const place = p && num(p.lat) && num(p.lon) && Math.abs(p.lat as number) <= 90 && Math.abs(p.lon as number) <= 180
    ? { name: str(p.name, 200), lat: p.lat as number, lon: p.lon as number, elev: num(p.elev) ? (p.elev as number) : 0, tz: str(p.tz, 100) || 'UTC' } : null;
  const at = typeof o.at === 'string' && Number.isFinite(Date.parse(o.at)) ? o.at : null;
  if (!place && !at) return null;
  return {
    id: str(o.id, 100) || newId(), name: str(o.name, 200) || 'Moment', desc: str(o.desc), place, at,
    color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : COLOURS[0],
    tags: Array.isArray(o.tags) ? [...new Set(o.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 60)).filter(Boolean))] : [],
    saved: typeof o.saved === 'string' && Number.isFinite(Date.parse(o.saved)) ? o.saved : new Date().toISOString(),
  };
}
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Tags as typed: comma separated, trimmed, without repeats. */
export const readTags = (text: string) => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];

/** The link that opens a moment: its place (or none) and its instant (or none), in Atlas. */
export function momentLink(m: Pick<Moment, 'place' | 'at'>, base: string): string {
  const q = new URLSearchParams();
  if (m.place) { q.set('lat', m.place.lat.toFixed(4)); q.set('lon', m.place.lon.toFixed(4)); q.set('elev', String(Math.round(m.place.elev))); q.set('tz', m.place.tz); if (m.place.name) q.set('name', m.place.name); }
  if (m.at) q.set('at', m.at);
  return `${base}?${q}#atlas`;
}

/** The file the list exports to, and reads back. */
export const exportJson = (list: Moment[]) => JSON.stringify({ kind: 'enoch.moments', version: 1, moments: list }, null, 1);
/** Moments from an exported file (or a bare list): the ones that are moments, and how many were not. */
export function importJson(text: string): { moments: Moment[]; skipped: number } {
  const j = JSON.parse(text) as unknown, raw = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { moments?: unknown }).moments) ? (j as { moments: unknown[] }).moments : null;
  if (!raw) throw new Error('not a list of moments');
  const moments = raw.map(cleanMoment).filter((m): m is Moment => !!m);
  return { moments, skipped: raw.length - moments.length };
}
/** Imported moments joined to the list: one with the same id replaces it, the rest are added at the top. */
export function merge(list: Moment[], add: Moment[]): Moment[] {
  const ids = new Set(add.map((m) => m.id));
  return [...add, ...list.filter((m) => !ids.has(m.id))];
}

/** The list kept on this device (empty when there is none, or storage is closed). */
export function loadMoments(): Moment[] {
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(j) ? j.map(cleanMoment).filter((m): m is Moment => !!m) : []; } catch { return []; }
}
export function saveMoments(list: Moment[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** The items a tag filter and a search leave: every chosen tag, and the words in the name, note or region. */
export function filterItems<T extends { name: string; tags: string[]; desc?: string; region?: string }>(items: T[], tags: Set<string>, query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((m) => [...tags].every((t) => m.tags.includes(t)) && words.every((w) => `${m.name} ${m.desc ?? ''} ${m.region ?? ''}`.toLowerCase().includes(w)));
}
