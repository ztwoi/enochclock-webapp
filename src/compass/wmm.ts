// World Magnetic Model 2025 (NOAA/BGS), degree and order 12: the declination that turns a
// device's magnetic heading into a true bearing. Follows the WMM2025 technical report:
// geodetic → geocentric spherical, Schmidt semi-normalised Legendre functions, secular variation
// linear from 2025.0, field rotated back to the geodetic frame. Checked against NOAA's 100 test values.
import { WMM_COF, WMM_EPOCH } from './wmm2025';

const N = 12, A = 6378.137, F = 1 / 298.257223563, E2 = F * (2 - F), RE = 6371.2, D = Math.PI / 180;
const idx = (n: number, m: number) => (n * (n + 1)) / 2 + m;
const g0 = new Float64Array(idx(N, N) + 1), h0 = g0.slice(), gd = g0.slice(), hd = g0.slice();
for (const line of WMM_COF.trim().split('\n')) {
  const [n, m, g, h, gt, ht] = line.trim().split(/\s+/).map(Number), k = idx(n, m);
  g0[k] = g; h0[k] = h; gd[k] = gt; hd[k] = ht;
}

export interface Field { X: number; Y: number; Z: number; H: number; F: number; D: number; I: number }

/** Field at geodetic latitude/longitude (degrees), height above the WGS84 ellipsoid (km), decimal year. */
export function magneticField(lat: number, lon: number, hKm: number, year: number): Field {
  const t = year - WMM_EPOCH, phi = lat * D, lam = lon * D;
  // geodetic → geocentric spherical
  const rc = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2), p = (rc + hKm) * Math.cos(phi), z = (rc * (1 - E2) + hKm) * Math.sin(phi);
  const r = Math.hypot(p, z), phic = Math.asin(z / r), ct = Math.sin(phic), st = Math.cos(phic);   // θ = colatitude
  // Schmidt semi-normalised P(n,m)(cos θ) and dP/dθ by the Gauss recursion, then normalised
  const P = new Float64Array(idx(N, N) + 1), dP = P.slice(), S = P.slice();
  P[0] = 1; S[0] = 1;
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      const k = idx(n, m);
      if (n === m) { const j = idx(n - 1, m - 1); P[k] = st * P[j]; dP[k] = st * dP[j] + ct * P[j]; }
      else if (n === 1 || m === n - 1) { const j = idx(n - 1, m); P[k] = ct * P[j]; dP[k] = ct * dP[j] - st * P[j]; }
      else { const j = idx(n - 1, m), j2 = idx(n - 2, m), K = ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
        P[k] = ct * P[j] - K * P[j2]; dP[k] = ct * dP[j] - st * P[j] - K * dP[j2]; }
      S[k] = m === 0 ? (S[idx(n - 1, 0)] * (2 * n - 1)) / n : S[idx(n, m - 1)] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }
  let br = 0, bt = 0, bp = 0;
  for (let n = 1; n <= N; n++) {
    const ar = (RE / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      const k = idx(n, m), g = S[k] * (g0[k] + t * gd[k]), h = S[k] * (h0[k] + t * hd[k]), c = Math.cos(m * lam), s = Math.sin(m * lam);
      br += (n + 1) * ar * (g * c + h * s) * P[k];
      bt -= ar * (g * c + h * s) * dP[k];
      bp += ar * m * (g * s - h * c) * P[k];
    }
  }
  bp /= st;   // the pole itself is outside the dial's use (WMM's own code treats it specially)
  const xc = -bt, yc = bp, zc = -br, psi = phic - phi;   // geocentric north/east/down → geodetic
  const X = xc * Math.cos(psi) - zc * Math.sin(psi), Y = yc, Z = xc * Math.sin(psi) + zc * Math.cos(psi), H = Math.hypot(X, Y);
  return { X, Y, Z, H, F: Math.hypot(H, Z), D: Math.atan2(Y, X) / D, I: Math.atan2(Z, H) / D };
}

/** Declination (degrees, east positive): true bearing = magnetic bearing + declination. */
export const declination = (lat: number, lon: number, hKm: number, year: number) => magneticField(lat, lon, hKm, year).D;

/** Decimal year of a Unix time (the WMM's own definition: fraction of the calendar year). */
export function decimalYear(ms: number) {
  const y = new Date(ms).getUTCFullYear(), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (ms - a) / (b - a);
}
