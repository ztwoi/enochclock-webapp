// Following the Sun (Sky's Sun button, The Day's Follow Sun): the view turns with the Sun and opens out at midday and midnight so
// the horizon and the Sun are both in view (viewFor). Its zoom is a multiplier on that view: following starts from the zoom on
// show (zoom in, then follow: it follows that close; not zoomed in, 1×), and while it follows a pinch, the wheel, + and − change
// it and a double tap (or 0) brings it back to 1×. A drag takes the sky and ends following.
import type { Sky } from '../skyview';
import { viewFor, zoomRange } from './geometry';

export type SunFollow = ReturnType<typeof createSunFollow>;

/** `stopped`: a hand took the sky while it followed. `k`: the zoom to follow at (a Sky rebuilt for a new year keeps it). */
export function createSunFollow(sky: Sky, on: boolean, stopped: () => void, k = 1) {
  const sunNow = () => sky.info()?.sun ?? null;
  /** Turn the view to the Sun at the sky's instant (after setInstant), zoomed k times. */
  function aim() {
    const sun = on ? sunNow() : null; if (!sun) return;
    const v = viewFor(sun.alt, k); sky.look(sun.az, v.mid, v.span);
  }
  /** The zoom on show as a multiplier on the Sun's view: closer than it, kept; otherwise 1×. */
  function zoomOnShow() {
    const sun = sunNow(), span = sky.viewSpan(); if (!sun || !(span > 0)) return 1;
    const [, hi] = zoomRange(sun.alt);
    return Math.min(hi, Math.max(1, viewFor(sun.alt).span / span));
  }
  sky.stage.setZoomHook({
    active: () => on,
    zoom(f) {
      if (!on) return false;
      const sun = sunNow(), [lo, hi] = sun ? zoomRange(sun.alt) : [1, 1];
      k = f === null ? 1 : Math.min(hi, Math.max(lo, k * f));
      aim(); return true;
    },
  });
  sky.onUser(() => { if (on) { on = false; stopped(); } });
  return {
    get on() { return on; },
    /** The zoom multiplier (1: the view that holds the horizon and the Sun). */
    get k() { return k; },
    /** Follow, from the zoom on show; or stop. */
    set(v: boolean) { if (v && !on) k = zoomOnShow(); on = v; if (!v) k = 1; aim(); },
    aim,
  };
}
