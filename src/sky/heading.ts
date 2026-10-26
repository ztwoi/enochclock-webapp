// A heading eased toward its target: exponential on the circle (the shorter way round, through
// north as anywhere), with a time constant, so the same motion at any frame rate.
export const mod360 = (a: number) => ((a % 360) + 360) % 360;
/** a in (−180, 180]: the signed shorter way round. */
export const wrap180 = (a: number) => { const r = mod360(a + 180) - 180; return r === -180 ? 180 : r; };
/** Within this of the target (degrees), the heading is the target. */
export const SETTLED = 0.005;

/** The heading `dt` seconds on from `now`, easing to `target` with time constant `tau` seconds. */
export function easeHeading(now: number, target: number, dt: number, tau: number) {
  const d = wrap180(target - now);
  return Math.abs(d) < SETTLED ? mod360(target) : mod360(now + d * (1 - Math.exp(-dt / tau)));
}
