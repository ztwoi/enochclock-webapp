// Catalogue stars projected into the local sky, for the Sky view's redraw.
//
// The maths is exactly astronomy.ts `starVector` -> instrument.ts `aberrate` -> skyFrame's `direction` (RotateVector +
// HorizonFromVector) -> `apparentAltitude`, and `declinationOfDate`; tests/sky-starfield.test.ts holds this to those
// functions star by star. What differs is the cost: everything that depends only on the star (its trig, its style) is computed once;
// everything that depends only on the instant (the rotation, the precession matrix) once per frame; and no object is allocated per star.
import {Rotation_EQJ_EQD, type AstroTime} from 'astronomy-engine';
import type {Star} from './catalogue';
import {starStyle, starColor} from './appearance';
import {apparentAltitude} from './instrument';

const D = Math.PI / 180, R2D = 180 / Math.PI, MAS = D / 3600000;
/** Retained at its source position, excluded from epoch accuracy (astronomy.ts). */
const FLAGGED = 'hyg:4.1:87665';

export interface Aberration { x: number; y: number; z: number }
export interface Refraction { hpa: number; celsius: number }
interface FrameLike { time: AstroTime; rotation: { rot: number[][] } }

export class StarField {
  n = 0;
  /** Frame counter shared by every view of this field, so a stamp left by an earlier view can never read as current. */
  clock = 0;
  private cap = 0;
  // per star, fixed
  cosA = new Float64Array(0); sinA = new Float64Array(0); cosD = new Float64Array(0); sinD = new Float64Array(0);
  pmE = new Float64Array(0); pmN = new Float64Array(0); mag = new Float64Array(0);
  size = new Float32Array(0); alpha = new Float32Array(0); rgb = new Float32Array(0);
  // per star, per frame: where it was last put, and in which frame (so a figure's end that was not projected can be asked for)
  az = new Float64Array(0); alt = new Float64Array(0); stamp = new Uint32Array(0);
  private ids: Map<string, number> | null = null;
  constructor(readonly stars: Star[]) { this.sync(); }

  /** Take in stars appended to the catalogue since (a deeper magnitude loaded on demand). */
  sync() {
    const total = this.stars.length;
    if (total === this.n) return;
    if (total > this.cap) this.grow(Math.max(total, this.cap * 2, 1024));
    for (let i = this.n; i < total; i++) {
      const s = this.stars[i], a = s.ra_deg * D, d = s.dec_deg * D, flagged = s.id === FLAGGED;
      this.cosA[i] = Math.cos(a); this.sinA[i] = Math.sin(a); this.cosD[i] = Math.cos(d); this.sinD[i] = Math.sin(d);
      this.pmE[i] = flagged ? 0 : s.pm_ra_cosdec_mas_per_year; this.pmN[i] = flagged ? 0 : s.pm_dec_mas_per_year;
      this.mag[i] = s.mag_v;
      const sty = starStyle(s.mag_v), c = starColor(s.bv);
      this.size[i] = sty.size; this.alpha[i] = Math.min(1, sty.alpha * 1.6);
      this.rgb[3 * i] = c[0]; this.rgb[3 * i + 1] = c[1]; this.rgb[3 * i + 2] = c[2];
    }
    this.n = total; this.ids = null;
  }
  private grow(cap: number) {
    const f64 = (o: Float64Array) => { const n = new Float64Array(cap); n.set(o.subarray(0, this.n)); return n; };
    const f32 = (o: Float32Array, k = 1) => { const n = new Float32Array(cap * k); n.set(o.subarray(0, this.n * k)); return n; };
    this.cosA = f64(this.cosA); this.sinA = f64(this.sinA); this.cosD = f64(this.cosD); this.sinD = f64(this.sinD);
    this.pmE = f64(this.pmE); this.pmN = f64(this.pmN); this.mag = f64(this.mag); this.az = f64(this.az); this.alt = f64(this.alt);
    this.size = f32(this.size); this.alpha = f32(this.alpha); this.rgb = f32(this.rgb, 3);
    const st = new Uint32Array(cap); st.set(this.stamp.subarray(0, this.n)); this.stamp = st;
    this.cap = cap;
  }
  /** Index of a star by catalogue ID, -1 if it is not loaded. */
  indexOf(id: string) {
    if (!this.ids) { this.ids = new Map(); for (let i = 0; i < this.n; i++) this.ids.set(this.stars[i].id, i); }
    return this.ids.get(id) ?? -1;
  }
  /** The projection of every star at one instant. `refraction`: the atmosphere to draw through, or null for true altitudes. */
  projector(frame: FrameLike, aberration: Aberration, refraction: Refraction | null) { return new Projector(this, frame, aberration, refraction); }
}

/** One instant's projection. `star(i)` puts star i's azimuth and true altitude in `az`/`trueAlt`; `altitude()` is what is drawn. */
class Projector {
  az = 0; trueAlt = 0;
  private ux = 0; private uy = 0; private uz = 0;
  private readonly years: number; private readonly m: number[][]; private eqd: number[][] | null = null;
  constructor(private f: StarField, private frame: FrameLike, private k: Aberration, private refr: Refraction | null) {
    this.years = frame.time.tt / 365.25; this.m = frame.rotation.rot;
  }
  /** Star i: apparent (aberrated) direction in the local axes. */
  star(i: number) {
    const f = this.f, k = this.k, m = this.m, east = f.pmE[i] * this.years * MAS, north = f.pmN[i] * this.years * MAS;
    const ca = f.cosA[i], sa = f.sinA[i], cd = f.cosD[i], sd = f.sinD[i];
    const x = cd * ca - east * sa - north * sd * ca, y = cd * sa + east * ca - north * sd * sa, z = sd + north * cd;
    const n = Math.sqrt(x * x + y * y + z * z);
    const ux = this.ux = x / n + k.x, uy = this.uy = y / n + k.y, uz = this.uz = z / n + k.z;
    const X = m[0][0] * ux + m[1][0] * uy + m[2][0] * uz, Y = m[0][1] * ux + m[1][1] * uy + m[2][1] * uz, Z = m[0][2] * ux + m[1][2] * uy + m[2][2] * uz;
    const xy = X * X + Y * Y;
    let lon = 0;
    if (xy === 0) { this.trueAlt = Z < 0 ? -90 : 90; }
    else { lon = Math.atan2(Y, X) * R2D; if (lon < 0) lon += 360; this.trueAlt = Math.atan2(Z, Math.sqrt(xy)) * R2D; }
    let az = 360 - lon;                                   // the compass runs the other way round (astronomy-engine ToggleAzimuthDirection)
    if (az >= 360) az -= 360; else if (az < 0) az += 360;
    this.az = az;
  }
  /** The altitude as drawn: refracted as at sunrise when an atmosphere was given. Azimuth is unaffected, so test it first. */
  altitude() { return this.refr ? apparentAltitude(this.trueAlt, this.refr.hpa, this.refr.celsius) : this.trueAlt; }
  /** Declination of date of the star last passed to `star` (apparent: aberration is in its direction). */
  dec() {
    const e = this.eqd ??= Rotation_EQJ_EQD(this.frame.time).rot, ux = this.ux, uy = this.uy, uz = this.uz;
    const X = e[0][0] * ux + e[1][0] * uy + e[2][0] * uz, Y = e[0][1] * ux + e[1][1] * uy + e[2][1] * uz, Z = e[0][2] * ux + e[1][2] * uy + e[2][2] * uz;
    return Math.atan2(Z, Math.sqrt(X * X + Y * Y)) * R2D;
  }
}
