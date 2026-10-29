// Following a body (Sky's Sun button and Follow pill, The Day's Follow Sun): the view turns with the Sun, the Moon or a planet and opens out
// as it climbs high or sinks deep, so the horizon and the body are both in view (viewFor). Its zoom is a multiplier on that view: following
// starts from the zoom on show (zoom in, then follow: it follows that close; not zoomed in, 1×), and while it follows a pinch, the wheel,
// + and − change it and a double tap (or 0) brings it back to 1×. A drag takes the sky and ends following.
import { positionOf, sameBody, type Followed, type Sky } from '../skyview';
import { viewFor, zoomRange } from './geometry';

export type Follow = ReturnType<typeof createFollow>;

/** `target`: the body followed, or null (not following). `stopped`: a hand took the sky while it followed. `k`: the zoom to follow at
 *  (a Sky rebuilt for a new year keeps it). */
export function createFollow(sky: Sky, target: Followed | null, stopped: () => void, k = 1) {
  const where = (t = target) => { const info = sky.info(); return t && info ? positionOf(info, t) : null; };
  /** Turn the view to the body at the sky's instant (after setInstant), zoomed k times. */
  function aim() {
    const b = where(); if (!b) return;
    const v = viewFor(b.alt, k); sky.look(b.az, v.mid, v.span);
  }
  /** The zoom on show as a multiplier on the body's view: closer than it, kept; otherwise 1×. */
  function zoomOnShow(t: Followed) {
    const b = where(t), span = sky.viewSpan(); if (!b || !(span > 0)) return 1;
    const [, hi] = zoomRange(b.alt);
    return Math.min(hi, Math.max(1, viewFor(b.alt).span / span));
  }
  sky.stage.setZoomHook({
    active: () => target !== null,
    zoom(f) {
      if (!target) return false;
      const b = where(), [lo, hi] = b ? zoomRange(b.alt) : [1, 1];
      k = f === null ? 1 : Math.min(hi, Math.max(lo, k * f));
      aim(); return true;
    },
  });
  sky.onUser(() => { if (target) { target = null; sky.setFollowed(null); stopped(); } });
  sky.setFollowed(target);
  return {
    get on() { return target !== null; },
    /** The body followed, or null. */
    get target() { return target; },
    /** The zoom multiplier (1: the view that holds the horizon and the body). */
    get k() { return k; },
    /** Follow a body, from the zoom on show (another body: from the zoom on show again); or stop (null). */
    set(t: Followed | null) {
      if (t && !sameBody(t, target)) k = zoomOnShow(t);
      target = t; if (!t) k = 1;
      sky.setFollowed(t); aim();
    },
    aim,
  };
}
