// The one place the app asks the browser where the device is. The observer dialog, the first-run lookup and
// Sky's compass mode all come through here, so a failure reads the same wherever it happens and says what to do.
// Browsers cannot re-ask once a site is blocked; they can re-ask after a dismissal. `locate` tells the two apart.

export interface Fix { lat: number; lon: number; elev: number; accuracy: number }
/** Why a lookup failed. `blocked` cannot be re-asked from the page; the rest can be tried again. */
export type FailKind = 'insecure' | 'blocked' | 'dismissed' | 'unavailable' | 'timeout';
export type PermState = 'granted' | 'prompt' | 'denied' | 'unknown';

class LocateError extends Error {
  constructor(readonly kind: FailKind) { super(kind); this.name = 'LocateError'; }
}

/** The browser's current answer, without asking. 'unknown' where the Permissions API cannot say (older Safari). */
export async function permissionState(): Promise<PermState> {
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'unknown'; }
}

/** Calls `cb` when the user changes the site's location permission in the browser's settings (no reload needed). */
export function onPermissionChange(cb: (s: PermState) => void): () => void {
  let status: PermissionStatus | null = null, gone = false;
  const fire = () => { if (status) cb(status.state); };
  navigator.permissions?.query({ name: 'geolocation' }).then((s) => { if (gone) return; status = s; s.addEventListener('change', fire); }).catch(() => undefined);
  return () => { gone = true; status?.removeEventListener('change', fire); };
}

/** How a GeolocationPositionError code reads, given what the Permissions API says afterwards. Code 1 is both
 *  "blocked" and "closed the prompt": only the permission state tells which (a dismissal leaves it at 'prompt'). */
export function classify(code: number, state: PermState): FailKind {
  if (code === 1) return state === 'prompt' ? 'dismissed' : 'blocked';
  return code === 3 ? 'timeout' : 'unavailable';
}

export interface LocateOpts { timeout?: number; maximumAge?: number }
/** Where the device is. From a tap, or at load; rejects with a LocateError. Never leaves the device. */
export function locate({ timeout = 8000, maximumAge = 600000 }: LocateOpts = {}): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) return reject(new LocateError('insecure'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, elev: p.coords.altitude ?? 0, accuracy: p.coords.accuracy }),
      async (e) => reject(new LocateError(classify(e.code, await permissionState()))),
      { timeout, maximumAge });
  });
}

const IOS = /iP(hone|ad|od)/;
/** The words for each failure. `ua` picks the settings path that matches the browser. */
export function failMessage(kind: FailKind, ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  switch (kind) {
    case 'insecure': return 'Location needs HTTPS or localhost: open this page at its https:// address.';
    case 'blocked': return `Location is blocked for this site, and a page cannot ask again once it is. Allow it in ${IOS.test(ua) ? 'Settings → Safari → Location, or the aA menu → Website Settings → Location' : 'the browser’s site settings (the icon left of the address)'}, then tap Retry.`;
    case 'dismissed': return 'Location was not shared. Tap Retry to ask again.';
    case 'timeout': return 'Finding your location took too long. Tap Retry.';
    default: return 'No location fix. Check that Location Services is on for this browser, then tap Retry.';
  }
}
