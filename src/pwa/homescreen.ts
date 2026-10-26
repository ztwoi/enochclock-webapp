// Putting the app on the Home Screen / desktop. Chromium offers a prompt we can trigger; iOS Safari has none, only Share → Add to Home Screen.
let deferred: (Event & {prompt(): Promise<void>}) | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as {standalone?: boolean}).standalone === true;
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function watchHomeScreen(): void {
 window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as typeof deferred; notify(); });
 window.addEventListener('appinstalled', () => { deferred = undefined; notify(); });
}
export const onHomeScreenChange = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** 'prompt': the browser can add it now · 'ios': tell the person how · 'none': already installed, or nothing to offer. */
export const homeScreenKind = (): 'prompt' | 'ios' | 'none' => standalone() ? 'none' : deferred ? 'prompt' : ios() ? 'ios' : 'none';
export async function promptHomeScreen(): Promise<void> {
 const d = deferred; deferred = undefined; notify();
 await d?.prompt();
}
