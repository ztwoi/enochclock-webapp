// Register the service worker (production builds, secure contexts). Failure is harmless: the app runs on the network as before.
export function registerServiceWorker(): void {
 if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !globalThis.isSecureContext) return;
 navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).catch(() => undefined);
}
