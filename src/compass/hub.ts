// The device's compass, once for the whole app. Sky and the Dial read the same sensor, so turning it on in one
// carries to the other with no second tap, and a Sun calibration made in either corrects both. The hub owns the
// start (a tap, for iOS's permission), the stop, the declination (the device's own place when it is known, else the
// observer's site) and the memory that it was on: a reload picks it up again (see `resume`).
import { createCompass, type CompassStatus, type Reading } from './compass';

const FLAG = 'enoch.compass.v1';
const readings = new Set<(r: Reading) => void>(), changes = new Set<() => void>();
const compass = createCompass((r) => readings.forEach((f) => f(r)), { smooth: false });   // each view eases the heading itself
let inflight: Promise<CompassStatus> | null = null, starting = false, siteDecl = 0, deviceDecl: number | null = null;
const changed = () => changes.forEach((f) => f());
const remember = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* storage may be off */ } };
/** iOS asks for motion access, and only from a tap; elsewhere the sensor can start on its own. */
const needsTap = () => typeof (globalThis as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent?.requestPermission === 'function';

export const hub = {
  /** The sensor itself: for the calibration offset and the live declination. */
  compass,
  get status(): CompassStatus { return compass.status; },
  /** Starting, waiting for a first reading, or reading: the compass is on. */
  get active() { return starting || compass.status === 'waiting' || compass.status === 'live'; },
  /** It was on when the page was last used (and nobody turned it off). */
  get wanted() { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } },
  /** Turn it on, from a tap where the browser needs one. Already on: nothing changes. */
  start(): Promise<CompassStatus> {
    if (inflight) return inflight;                                     // asked twice inside one permission prompt: one answer
    if (hub.active) return Promise.resolve(compass.status);
    starting = true; remember(true);
    inflight = compass.start().then((s) => { starting = false; if (s !== 'waiting') remember(false); inflight = null; changed(); return s; }, () => { starting = false; inflight = null; remember(false); changed(); return 'denied' as CompassStatus; });
    changed();                                                         // after `inflight` is set: a listener that asks to start gets this same answer
    return inflight;
  },
  /** Off for everyone, and forgotten: a reload does not turn it back on. */
  stop() { const was = hub.active || hub.wanted; compass.stop(); starting = false; remember(false); if (was) changed(); },
  /** The page was reloaded while it was on. Where no tap is needed, start it again; where one is, the first tap anywhere does it. */
  resume(): void {
    if (!hub.wanted || hub.active) return;
    if (!needsTap()) { void hub.start(); return; }
    const onTap = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-facing=compass]')) return void document.removeEventListener('click', onTap, true);   // the Compass button is its own tap
      document.removeEventListener('click', onTap, true); if (hub.wanted && !hub.active) void hub.start();                                   // still inside the tap: iOS asks here
    };
    document.addEventListener('click', onTap, true);
  },
  onReading(f: (r: Reading) => void) { readings.add(f); return () => void readings.delete(f); },
  onChange(f: () => void) { changes.add(f); return () => void changes.delete(f); },
  /** True north for a heading: the declination where the device is, else where the observer is. */
  setDeviceDeclination(d: number | null) { deviceDecl = d; compass.setDeclination(deviceDecl ?? siteDecl); },
  setSiteDeclination(d: number) { siteDecl = d; compass.setDeclination(deviceDecl ?? siteDecl); },
};
