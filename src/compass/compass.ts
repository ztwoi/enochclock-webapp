// Device heading for compass framing. Browsers expose it only in a secure context (HTTPS or
// localhost); iOS also asks permission from a tap. Sources, in order:
//  - iOS Safari: webkitCompassHeading (degrees clockwise from magnetic north, for the device top)
//  - Chromium: deviceorientationabsolute (alpha/beta/gamma against magnetic north), tilt-compensated
// The heading is the direction the phone points: its top edge when held flat, its back camera when
// held upright. Magnetic → true by the WMM2025 declination; a Sun calibration can replace both.

export type CompassStatus = 'off' | 'insecure' | 'unsupported' | 'denied' | 'waiting' | 'live';
export interface Reading { heading: number; magnetic: number; raw: number; source: 'ios' | 'absolute'; pose: 'flat' | 'upright'; accuracy: number | null }

const D = Math.PI / 180, wrap = (a: number) => ((a % 360) + 360) % 360;

/**
 * Magnetic heading from W3C device orientation (z-x'-y'' intrinsic, earth frame x east, y north,
 * z up). Flat: the top edge (0,1,0); upright (|beta| > 45°): the back camera (0,0,−1).
 */
export function headingFromEuler(alpha: number, beta: number, gamma: number) {
  const a = alpha * D, b = beta * D, g = gamma * D;
  if (Math.abs(beta) <= 45) return { heading: wrap(-alpha), pose: 'flat' as const };
  const e = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const n = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
  return { heading: wrap(Math.atan2(e, n) / D), pose: 'upright' as const };
}

/** Screen rotation (degrees clockwise) so landscape holds read the screen's top, not the device's. */
const screenAngle = () => (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);

interface IOSEvent extends DeviceOrientationEvent { webkitCompassHeading?: number; webkitCompassAccuracy?: number }

/** `smooth: false` passes each heading as read, for a view that eases it once itself (Sky); the Dial smooths here. */
export function createCompass(onReading: (r: Reading) => void, opts: { smooth?: boolean } = {}) {
  const smoothing = opts.smooth ?? true;
  let status: CompassStatus = 'off', declination = 0, offset: number | null = null, sx = 0, sy = 0, primed = false;
  const listeners: [string, EventListener][] = [];
  const smooth = (h: number) => {           // exponential smoothing on the unit circle
    const k = primed && smoothing ? 0.25 : 1; primed = true;
    sx = (1 - k) * sx + k * Math.sin(h * D); sy = (1 - k) * sy + k * Math.cos(h * D);
    return wrap(Math.atan2(sx, sy) / D);
  };
  function handle(ev: Event) {
    const e = ev as IOSEvent; let raw: number, source: Reading['source'], pose: Reading['pose'] = 'flat', accuracy: number | null = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      raw = e.webkitCompassHeading; source = 'ios'; accuracy = e.webkitCompassAccuracy ?? null;
      pose = Math.abs(e.beta ?? 0) > 45 ? 'upright' : 'flat';
    } else if (e.absolute && e.alpha !== null) {
      const h = headingFromEuler(e.alpha, e.beta ?? 0, e.gamma ?? 0); raw = h.heading; pose = h.pose; source = 'absolute';
    } else return;
    const magnetic = smooth(wrap(raw + screenAngle()));
    status = 'live';
    onReading({ heading: wrap(magnetic + (offset ?? declination)), magnetic, raw, source, pose, accuracy });
  }
  function listen(type: string) { const f = handle as EventListener; window.addEventListener(type, f); listeners.push([type, f]); }

  return {
    get status() { return status; },
    /** Must run from a tap (iOS permission prompt). */
    async start(): Promise<CompassStatus> {
      if (!window.isSecureContext) return (status = 'insecure');
      if (typeof DeviceOrientationEvent === 'undefined') return (status = 'unsupported');
      const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
      if (req) { try { if ((await req()) !== 'granted') return (status = 'denied'); } catch { return (status = 'denied'); } }
      if ('ondeviceorientationabsolute' in window) listen('deviceorientationabsolute');
      listen('deviceorientation');
      return (status = 'waiting');
    },
    stop() { for (const [t, f] of listeners) window.removeEventListener(t, f); listeners.length = 0; status = 'off'; primed = false; },
    setDeclination(d: number) { declination = d; },
    get declination() { return declination; },
    /** Calibrate on a body: the phone points at bearing `trueBearing` now (its magnetic heading `magnetic`, or the last read). */
    calibrate(trueBearing: number, magnetic?: number) { const m = magnetic ?? wrap(Math.atan2(sx, sy) / D); offset = ((trueBearing - m + 540) % 360) - 180; return offset; },
    clearCalibration() { offset = null; },
    get calibration() { return offset; },
  };
}
