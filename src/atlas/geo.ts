// Atlas geometry: the Earth as a unit sphere in Earth-fixed axes (x to 0° E on the equator, y to 90° E, z to the north
// pole), the era's obliquity and polar limit, and the analytic readouts the globe shows. Pure: no page, so the tests run it.

export type V3 = [number, number, number];
const D = Math.PI / 180;

export const vec = (lat: number, lon: number): V3 => [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const latLon = (v: V3) => ({ lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) / D, lon: Math.atan2(v[1], v[0]) / D });
export const norm180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

/** Mean obliquity of the ecliptic, degrees (Laskar 1986; good to 0.01″ over 1000 years and to a few arcseconds over 10,000). */
export function obliquity(jdUt: number) {
  const u = (jdUt - 2451545) / 3652500;
  const c = [84381.448, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45];
  let s = 0, p = 1;
  for (const k of c) { s += k * p; p *= u; }
  return s / 3600;
}

/** The latitude past which the calculator refuses a year (no sunrise on some day of it): about 90° − obliquity − 0.9°.
 *  The 0.9° is refraction, the Sun's semidiameter and the margin of the sunrise definition, fitted to the calculator's own
 *  refusals (2026, sea level: 65.6° calculates, 66.0° is refused; Oulu, 65.0° N, is refused around 7500 BCE). */
export const polarLimit = (jdUt: number) => 90 - obliquity(jdUt) - 0.9;

/** Which band a latitude is in for this era. */
export function band(lat: number, jdUt: number): 'tropic' | 'temperate' | 'edge' | 'polar' {
  const a = Math.abs(lat), lim = polarLimit(jdUt);
  return a > lim ? 'polar' : a > lim - 1.5 ? 'edge' : a < obliquity(jdUt) ? 'tropic' : 'temperate';
}

/** Great-circle distance, km (mean radius 6371 km). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const s = Math.sin((b.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin((b.lon - a.lon) * D / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** The eight-point compass word for the bearing from a to b ("NE"). */
export function bearingWord(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const y = Math.sin((b.lon - a.lon) * D) * Math.cos(b.lat * D);
  const x = Math.cos(a.lat * D) * Math.sin(b.lat * D) - Math.sin(a.lat * D) * Math.cos(b.lat * D) * Math.cos((b.lon - a.lon) * D);
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(y, x) / D + 360) % 360) / 45) % 8];
}
/** The nearest of a list of places, with its distance. */
export function nearest<P extends { lat: number; lon: number }>(p: { lat: number; lon: number }, places: P[]) {
  let best: { place: P; km: number } | null = null;
  for (const q of places) { const km = distanceKm(p, q); if (!best || km < best.km) best = { place: q, km }; }
  return best;
}

/** The camera's frame over a point: c toward it, e east, n north (unit vectors, Earth-fixed). */
export function frameAt(lat: number, lon: number) {
  const c = vec(lat, lon), e: V3 = [-Math.sin(lon * D), Math.cos(lon * D), 0];
  const n: V3 = [-Math.sin(lat * D) * Math.cos(lon * D), -Math.sin(lat * D) * Math.sin(lon * D), Math.cos(lat * D)];
  return { c, e, n };
}

/** A direction of date (equatorial, of-date axes) turned into Earth-fixed axes by the Greenwich apparent sidereal angle. */
export function toEarth(v: V3, gastDeg: number): V3 {
  const c = Math.cos(gastDeg * D), s = Math.sin(gastDeg * D);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
}

/** J2000 (astronomy-engine's EQJ) → Earth-fixed, as a row-major 3×3: of-date by `rot` (Rotation_EQJ_EQD's, where
 *  x' = rot[0][0]x + rot[1][0]y + rot[2][0]z …), then turned by the Greenwich apparent sidereal angle. */
export function eqjToEarth(rot: number[][], gastDeg: number): number[] {
  const c = Math.cos(gastDeg * D), s = Math.sin(gastDeg * D);
  const r0 = [rot[0][0], rot[1][0], rot[2][0]], r1 = [rot[0][1], rot[1][1], rot[2][1]], r2 = [rot[0][2], rot[1][2], rot[2][2]];   // of date, row by row
  return [...r0.map((x, k) => c * x + s * r1[k]), ...r0.map((x, k) => -s * x + c * r1[k]), ...r2];
}
export const apply3 = (m: number[], v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** Altitude of the Sun's centre at sunrise and sunset as the almanacs reckon it (refraction 34′, semidiameter 16′). */
const H0 = -0.833;
/** The Sun's rising azimuth (degrees from north) at a latitude for a declination; NaN when it does not rise or set. */
export function riseAzimuth(lat: number, dec: number) {
  const c = (Math.sin(dec * D) - Math.sin(lat * D) * Math.sin(H0 * D)) / (Math.cos(lat * D) * Math.cos(H0 * D));
  return Math.abs(c) > 1 ? NaN : Math.acos(c) / D;
}
/** Hours from sunrise to sunset at a latitude for a declination (0 or 24 when the Sun does not rise or set). */
export function dayHours(lat: number, dec: number) {
  const c = (Math.sin(H0 * D) - Math.sin(lat * D) * Math.sin(dec * D)) / (Math.cos(lat * D) * Math.cos(dec * D));
  return c <= -1 ? 24 : c >= 1 ? 0 : (2 * Math.acos(c)) / D / 15;
}
/** What a year at a latitude would show, before the calculator is asked: the span of sunrise azimuths and the longest and
 *  shortest days, at the solstices of the era (its obliquity). */
export function preview(lat: number, jdUt: number) {
  const e = obliquity(jdUt), a = riseAzimuth(lat, e), b = riseAzimuth(lat, -e), d1 = dayHours(lat, e), d2 = dayHours(lat, -e);
  return { north: a, south: b, longest: Math.max(d1, d2), shortest: Math.min(d1, d2), band: band(lat, jdUt) };
}
