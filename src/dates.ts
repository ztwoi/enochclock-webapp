// Dates across the whole ephemeris range (Enoch years beginning −12998 … 16995), as the calculator writes them: years 0–9999
// as YYYY, beyond as the ISO extended ±YYYYYY. Astronomical numbering: year 0 = 1 BCE, −1 = 2 BCE.
// Enoch dates before the epoch carry a sign too ("-0235-03-09").

const DATE = /^([+-]?\d+)-(\d{2})-(\d{2})/;

/** The calculator's range of Enoch years. */
export const YEAR_MIN = -12998, YEAR_MAX = 16995;

export function parseDate(iso: string): { y: number; m: number; d: number } {
  const m = DATE.exec(iso);
  if (!m) throw new Error(`not a date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
export const yearOf = (iso: string) => parseDate(iso).y;

/** ISO date in the calculator's form. */
export function isoDate(y: number, m: number, d: number): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const ys = y >= 0 && y <= 9999 ? String(y).padStart(4, '0') : `${y < 0 ? '-' : '+'}${String(Math.abs(y)).padStart(6, '0')}`;
  return `${ys}-${p2(m)}-${p2(d)}`;
}

/** The UT calendar date of an instant (proleptic Gregorian; JavaScript dates cover ±271,821 years). */
export function isoFromJd(jd: number): string {
  const t = new Date((jd - 2440587.5) * 86400000);
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The Gregorian date and clock time of an instant at a site. Years 2–9998: the time zone's own rules (summer time
 *  exact to the second). Beyond: the calculator's UTC offset for that day (`offset` as in "-07:52:58", local mean time). */
const zoneFormats = new Map<string, Intl.DateTimeFormat>();   // building one is slow, and this runs every frame while a view plays
const zoneFormat = (tz: string) => {
  let f = zoneFormats.get(tz);
  if (!f) zoneFormats.set(tz, f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  return f;
};
export function localDateTime(jd: number, tz: string, offset: string): { date: string; time: string } {
  const ms = (jd - 2440587.5) * 86400000, p2 = (n: number) => String(n).padStart(2, '0'), y = yearOf(isoFromJd(jd));
  if (y >= 2 && y <= 9998) {
    const parts = Object.fromEntries(zoneFormat(tz).formatToParts(new Date(ms)).map((q) => [q.type, q.value]));
    return { date: civil(isoDate(Number(parts.year), Number(parts.month), Number(parts.day))), time: `${parts.hour}:${parts.minute}:${parts.second}` };
  }
  const m = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?/.exec(offset), off = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0)) : 0;
  const t = new Date(ms + off * 1000);
  return { date: civil(isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())), time: `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())}` };
}

/** A year for people: 2026, 12000, or "501 BCE" for −500 (and 0 = 1 BCE). */
export const yearLabel = (y: number) => (y <= 0 ? `${1 - y} BCE` : String(y));

/** A civil date for people: unchanged for years 1–9999; otherwise plain digits, with the BCE year alongside. */
export function civil(iso: string): string {
  const { y, m, d } = parseDate(iso);
  if (y >= 1 && y <= 9999) return iso.slice(0, 10);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${y < 0 ? '−' : ''}${Math.abs(y)}-${p2(m)}-${p2(d)}${y <= 0 ? ` (${yearLabel(y)})` : ''}`;
}

/** An Enoch date split into [year, month, day] for display, keeping a negative year's sign. */
export function enochParts(iso: string): [string, string, string] {
  const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return [iso, '', ''];
  return [m[1].startsWith('-') ? `−${m[1].slice(1)}` : m[1], m[2], m[3]];
}
export const enochText = (iso: string, sep = ' · ') => enochParts(iso).join(sep);

/** The clock time and UTC offset of a local time from the calculator ("…T06:18:11-07:52:58"). */
const TIME = /T(\d{2}:\d{2}:\d{2})(.*)$/;
export const timeOf = (iso: string) => TIME.exec(iso)?.[1] ?? '';
export const offsetOf = (iso: string) => TIME.exec(iso)?.[2] || 'Z';

/** Read a typed date: "2026-10-20", "-500-03-21" (501 BCE), "12000-3-19"; returns the calculator's form, or null. */
export function readDate(text: string): string | null {
  const m = /^\s*([+\-−]?\d{1,6})-(\d{1,2})-(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const y = Number(m[1].replace('−', '-')), mo = Number(m[2]), d = Number(m[3]);
  if (y < YEAR_MIN || y > YEAR_MAX || mo < 1 || mo > 12 || d < 1) return null;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0), len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= len ? isoDate(y, mo, d) : null;
}
