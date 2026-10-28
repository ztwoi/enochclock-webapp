// The Day's arrangement and the Sky's view in it: pure, so the tests run them (src/day/view.ts draws with them).

export interface Box { x: number; y: number; w: number; h: number }
/** Where things go in the host (CSS pixels): the sky's box, the dial's centre and diameter, the foot (captions and the day bar),
 *  and whether the dial is beside the sky (its Sun at the left) or under it (its Sun at the top). */
export interface Geometry { side: boolean; sky: Box; dial: { cx: number; cy: number; d: number }; foot: Box }

/** The app's arrangement in a host w × h whose top `top` pixels hold the options row (the sky runs under them, as in Sky).
 *  Tall: the sky over the dial, the dial a little narrower than the screen with its lower part off the edge. Wide: the dial
 *  whole at the right, the sky to its left. */
export function geometryFor(w: number, h: number, top = 0): Geometry {
  const H = h - top;
  if (w < H * 1.25) {
    const skyH = Math.round(H * 0.46), d = Math.min(w * 1.04, (H - skyH) / 0.78), footH = Math.min(132, H * 0.22);
    return { side: false, sky: { x: 0, y: 0, w, h: top + skyH }, dial: { cx: w / 2, cy: top + skyH + 6 + d / 2, d }, foot: { x: 0, y: h - footH, w, h: footH } };
  }
  const d = Math.min(H - 28, w * 0.5), cx = w - d / 2 - Math.max(12, w * 0.02), skyW = Math.round(cx - d / 2 + d * 0.04), footH = Math.min(120, H * 0.24);
  return { side: true, sky: { x: 0, y: 0, w: skyW, h }, dial: { cx, cy: top + H / 2, d }, foot: { x: 0, y: h - footH, w: skyW, h: footH } };
}

/** The Sky's view always holds both the horizon and the Sun: at least SPAN° of altitude, opened up while the Sun climbs high or
 *  sinks deep, MARGIN° kept beyond it. Smooth max and min, so the view's edges glide where the Sun takes over from the horizon. */
const SPAN = 70, MARGIN = 17;
const smax = (a: number, b: number, k = 12) => (a + b + Math.hypot(a - b, k)) / 2, smin = (a: number, b: number, k = 12) => (a + b - Math.hypot(a - b, k)) / 2;
/** A zoom while following multiplies that view: from ZOOM_MIN (wider) to ZOOM_MAX (closer), never closer than SPAN_MIN° of
 *  altitude top to bottom nor wider than SPAN_MAX°. */
export const ZOOM_MIN = 0.6, ZOOM_MAX = 8, SPAN_MIN = 14, SPAN_MAX = 180;
/** The middle and height (degrees of altitude) of the view for a Sun at `alt`, zoomed `k` times. Zoomed in, the middle moves toward
 *  the Sun just enough to keep it in view (the horizon may leave it); zoomed out, it stays. */
export function viewFor(alt: number, k = 1) {
  const hi = smax(alt + MARGIN, 30), lo = smin(alt - MARGIN, -22), mid = (hi + lo) / 2, span0 = smax(hi - lo, SPAN);
  if (k === 1) return { mid, span: span0 };
  const span = Math.min(SPAN_MAX, Math.max(SPAN_MIN, span0 / k)), half = span / 2, m = Math.min(half * 0.35, MARGIN);
  return { mid: Math.min(alt + half - m, Math.max(alt - half + m, mid)), span };
}
/** The zooms that change the view for a Sun at `alt` (beyond them the view is at its closest or widest). */
export function zoomRange(alt: number): [number, number] {
  const span0 = viewFor(alt).span;
  return [Math.max(ZOOM_MIN, span0 / SPAN_MAX), Math.min(ZOOM_MAX, span0 / SPAN_MIN)];
}
