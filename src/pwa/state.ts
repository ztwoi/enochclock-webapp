// Whether this device has the verified offline pack installed. Written only after a complete, verified install.
const KEY = 'enoch.offline.v1';
export function isInstalled(): boolean {
 try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; }
}
export function setInstalled(installed: boolean): void {
 try { if (installed) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage unavailable: stays uninstalled */ }
}
