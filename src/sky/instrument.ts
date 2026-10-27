// Computations for the Sky view, on top of the frame in astronomy.ts.
// Conventions: astrometric J2000 inputs rotated to
// local true-of-date axes, then made apparent: annual aberration on every star and body
// (as the Swiss Ephemeris positions behind the portals have it), and the sunrise
// convention's own refraction (below) on every drawn altitude when Refraction is on, and
// always where a quantity is compared with the portal edges.
import { BaryState, Body, C_AUDAY, Equator, EquatorFromVector, GeoVector, Illumination, ObserverVector, RotateVector, Rotation_ECT_EQJ, Rotation_EQJ_EQD, Vector, VectorFromSphere, Spherical, type AstroTime } from 'astronomy-engine';
import { dayIndexAt } from '../model';
import type { Portal, Row, YearDoc } from '../types';
import { skyFrame, starVector } from './astronomy';
import type { Star } from './catalogue';

const D = Math.PI / 180;
/** The sunrise convention's atmosphere (Swiss Ephemeris' defaults). */
const STANDARD_HPA = 1013.25, STANDARD_C = 15;

/**
 * Astronomical refraction at an apparent altitude, in degrees: Swiss Ephemeris' swe_refrac_extended
 * (Sinclair's formula, scaled for pressure and temperature). Its rise times use it, so at sunrise the
 * Sun's upper limb sits at a true altitude of −refraction(0) = −33.59′.
 */
export function refraction(app: number, hpa = STANDARD_HPA, celsius = STANDARD_C) {
  const r = app > 17.904104638432 ? 0.97 / Math.tan(app * D) : (34.46 + 4.23 * app + 0.004 * app * app) / (1 + 0.505 * app + 0.0845 * app * app);
  return (((hpa - 80) / 930 / (1 + 0.00008 * (r + 39) * (celsius - 10))) * r) / 60;
}

/** Refraction of a point source at the level horizon, as in the sunrise convention (33.59′). */
export const HORIZON_REFRACTION_DEG = refraction(0);

/**
 * Apparent altitude of a true (unrefracted) one: the inverse of `refraction`, by fixed-point iteration
 * (it contracts: |dR/dh| < 0.25). Below the apparent horizon nothing is seen; there the horizon's
 * refraction carries on unchanged, so a body crossing it moves continuously (presentation).
 */
export function apparentAltitude(alt: number, hpa = STANDARD_HPA, celsius = STANDARD_C) {
  const r0 = refraction(0, hpa, celsius);
  if (alt <= -r0) return alt + r0;
  let a = alt + r0;
  for (let k = 0; k < 50; k++) { const n = alt + refraction(a, hpa, celsius); if (Math.abs(n - a) < 1e-12) return n; a = n; }
  return a;
}

export type Frame = ReturnType<typeof skyFrame>;

/** Annual aberration at an instant: the Earth's barycentric velocity over c (J2000 axes). */
export function aberration(time: AstroTime) {
  const e = BaryState(Body.Earth, time);
  return { x: e.vx / C_AUDAY, y: e.vy / C_AUDAY, z: e.vz / C_AUDAY };
}

/** A J2000 direction (any length) as the moving observer sees it: unit vector plus v/c (first order; the
 *  second-order term is below 0.001″; diurnal aberration, ≤ 0.32″, is left out). */
function aberrate(v: Vector, k: { x: number; y: number; z: number }) {
  const n = Math.hypot(v.x, v.y, v.z);
  return new Vector(v.x / n + k.x, v.y / n + k.y, v.z / n + k.z, v.t);
}

/** The same frame with annual aberration on every direction: apparent places, as Swiss Ephemeris gives them. */
export function aberrated(frame: Frame, k = aberration(frame.time)): Frame {
  const direction = (v: Vector) => frame.direction(aberrate(v, k));
  return { ...frame, direction, sun: direction(frame.sunVector) };
}

/** The same frame seen through the atmosphere: every direction's altitude refracted, azimuths unchanged. */
export function refracted(frame: Frame, hpa = STANDARD_HPA, celsius = STANDARD_C): Frame {
  const direction = (v: Vector) => { const h = frame.direction(v); return { az: h.az, alt: apparentAltitude(h.alt, hpa, celsius) }; };
  return { ...frame, direction, sun: { az: frame.sun.az, alt: apparentAltitude(frame.sun.alt, hpa, celsius) } };
}

/** Topocentric Moon (observer origin subtracted: lunar parallax reaches ~1°) and its illuminated fraction. */
export function moon(frame: Frame) {
  const g = GeoVector(Body.Moon, frame.time, false), o = ObserverVector(frame.time, frame.observer, false);
  const v = new Vector(g.x - o.x, g.y - o.y, g.z - o.z, frame.time);
  return { ...frame.direction(v), fraction: Illumination(Body.Moon, frame.time).phase_fraction };
}

/** A planet at the instant: topocentric direction (as the Dial draws it), visual magnitude, and declination of date
 *  (apparent, for where it crosses the horizon that day). */
export function planet(frame: Frame, body: Body) {
  const g = GeoVector(body, frame.time, false), o = ObserverVector(frame.time, frame.observer, false);
  return { ...frame.direction(new Vector(g.x - o.x, g.y - o.y, g.z - o.z, frame.time)), mag: Illumination(body, frame.time).mag,
    dec: Equator(body, frame.time, frame.observer, true, true).dec };
}

/** The ecliptic of date, sampled every `step` degrees of longitude, in local horizontal coordinates. */
export function ecliptic(frame: Frame, step = 1) {
  const rot = Rotation_ECT_EQJ(frame.time), out: { lon: number; az: number; alt: number }[] = [];
  for (let lon = 0; lon < 360; lon += step) out.push({ lon, ...frame.direction(RotateVector(rot, VectorFromSphere(new Spherical(0, lon, 1), frame.time))) });
  return out;
}

/** Declination of date (true equator and equinox) of a catalogue star; apparent when given the instant's `aberration`. */
export function declinationOfDate(s: Star, time: AstroTime, k?: ReturnType<typeof aberration>) {
  const v = starVector(s, time);
  return EquatorFromVector(RotateVector(Rotation_EQJ_EQD(time), k ? aberrate(v, k) : v)).dec;
}

/**
 * Azimuth where a fixed direction of declination `dec` crosses the apparent level horizon,
 * rising (east) or setting (west): cos A = (sin δ − sin φ sin h₀) / (cos φ cos h₀), h₀ = −HORIZON_REFRACTION_DEG.
 * Null when it never crosses at this latitude (circumpolar or never rising).
 */
export function horizonAzimuth(dec: number, latitude: number, rising = true) {
  const h0 = -HORIZON_REFRACTION_DEG * D, c = (Math.sin(dec * D) - Math.sin(latitude * D) * Math.sin(h0)) / (Math.cos(latitude * D) * Math.cos(h0));
  if (Math.abs(c) > 1) return null;
  const a = Math.acos(c) / D;
  return rising ? a : 360 - a;
}

/** Which portal a horizon azimuth falls in, by the portals' common spans (shared by both passages). */
export function portalAt(az: number, portals: Portal[]) {
  for (const p of portals) if (az >= p.common[0] && az <= p.common[1]) return { portal: p.portal, where: 'within' as const };
  const lo = Math.min(...portals.map((p) => p.union[0])), hi = Math.max(...portals.map((p) => p.union[1]));
  if (az < lo || az > hi) return { portal: null, where: 'outside' as const };
  return { portal: null, where: 'seam' as const };
}

/** UT Julian day of a fractional part (0–18, equal parts) of the Enoch day from sunrise `a` to next sunrise `b`. */
export const jdOfPart = (a: number, b: number, part: number) => a + (part / 18) * (b - a);

/**
 * The portals the Sun rises and sets in on the Enoch day that contains `jd`: where that day's sunrise and sunset bearings fall within a portal's common span
 * (the east's for the rising, the west's for the setting), or null: in a seam, outside the portals, or `jd` outside the year.
 */
export function litPortals(doc: YearDoc, jd: number): { east: number | null; west: number | null } {
  const k = dayIndexAt(doc, jd), e = doc.extended[k];
  if (k < 0 || !e) return { east: null, west: null };
  return { east: portalAt(doc.rows[k].azimuth_deg, doc.portals).portal, west: portalAt(e.sunset_azimuth_deg, doc.portals_west).portal };
}

/** A morning on which the Sun rose (east) or set (west) within a portal's common span. */
export interface Passage { k: number; row: Row; azimuth: number; daysAgo: number }

/**
 * The latest morning, up to the one containing `jd`, on which the Sun rose (east) or set (west) within the portal's common span: the Enoch day's sunrise or
 * sunset bearing is inside the span, the same test that lights an arch. A bearing in a seam, or outside the portals, counts for neither. Null when none yet
 * this Enoch year (the last passage was in the year before) or `jd` is outside the year.
 */
export function lastPassage(doc: YearDoc, side: 'east' | 'west', portal: number, jd: number): Passage | null {
  const now = dayIndexAt(doc, jd), p = (side === 'east' ? doc.portals : doc.portals_west).find((q) => q.portal === portal);
  if (now < 0 || !p) return null;
  for (let k = now; k >= 0; k--) {
    const row = doc.rows[k], az = side === 'east' ? row.azimuth_deg : doc.extended[k]?.sunset_azimuth_deg;
    if (!row.closing_boundary && az !== undefined && az >= p.common[0] && az <= p.common[1]) return { k, row, azimuth: az, daysAgo: now - k };
  }
  return null;
}

/**
 * The mornings of the last pass through a portal: the unbroken run of mornings, ending at `lastPassage`, whose sunrise (east) or sunset (west) bearing was
 * inside the portal's common span, oldest first. Each is one tick on the horizon, at the bearing where the Sun crossed it.
 */
export function passageRun(doc: YearDoc, side: 'east' | 'west', portal: number, jd: number): Passage[] {
  const last = lastPassage(doc, side, portal, jd), p = (side === 'east' ? doc.portals : doc.portals_west).find((q) => q.portal === portal);
  if (!last || !p) return [];
  const out: Passage[] = [];
  for (let k = last.k; k >= 0; k--) {
    const row = doc.rows[k], az = side === 'east' ? row.azimuth_deg : doc.extended[k]?.sunset_azimuth_deg;
    if (row.closing_boundary || az === undefined || az < p.common[0] || az > p.common[1]) break;
    out.unshift({ k, row, azimuth: az, daysAgo: last.daysAgo + (last.k - k) });
  }
  return out;
}
