// The portals on the Dial's horizon, drawn as the Sky draws them (src/skyview.ts): an arch over each portal's span (model.ts arches), springing at 55% of the
// height with an elliptical crown for the rest, and a hatched pillar over each seam. Altitude is the radius and azimuth the angle, exactly as the bodies
// are placed, so a body rising at an azimuth inside a span passes through its arch; the arch's sides lie on the radial lines of the span's two azimuths.
import { PORTAL_ALT } from '../model';

const SPRING = 0.55 * PORTAL_ALT, CROWN = 0.45 * PORTAL_ALT, STEPS = 24;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** `x y` at radius r, azimuth az (clockwise from the top); three decimals keep an edge within 0.0002° of its azimuth at the horizon. */
const at = (r: number, az: number) => `${(r * Math.sin(rad(az))).toFixed(3)} ${(-r * Math.cos(rad(az))).toFixed(3)}`;

/** The arch over a portal's span (model.ts arches): its sides, then the crown as the Sky's 24-step half-ellipse, mapped through `radius` (altitude → dial radius). */
export function archPath([lo, hi]: [number, number], radius: (alt: number) => number): string {
  const mid = (lo + hi) / 2, half = (hi - lo) / 2;
  let d = `M${at(radius(0), lo)}L${at(radius(SPRING), lo)}`;
  for (let k = 0; k <= STEPS; k++) { const t = Math.PI - (k / STEPS) * Math.PI; d += `L${at(radius(SPRING + Math.sin(t) * CROWN), mid + Math.cos(t) * half)}`; }
  return `${d}L${at(radius(0), hi)}`;
}

/** A seam pillar between two azimuths: the wedge from the horizon to the arches' full height. */
export function seamPath(lo: number, hi: number, radius: (alt: number) => number): string {
  const r0 = radius(0), r1 = radius(PORTAL_ALT);
  return `M${at(r0, lo)}L${at(r1, lo)}A${r1} ${r1} 0 0 1 ${at(r1, hi)}L${at(r0, hi)}A${r0} ${r0} 0 0 0 ${at(r0, lo)}Z`;
}

/** Whether a horizon azimuth lies within a portal's span (model.ts arches): the portal a body other than the Sun rises or sets in (the Sun's is its month's). */
export const within = ([lo, hi]: [number, number], az: number) => az >= lo && az <= hi;
