// The offline pack as one small state machine; the section, the invitation, the chip and the Details dot all render from it.
// Installing and removing switch the calculator in place: provider() reads the installed flag on every request.
import {activateWaiting, canInstall, installPack, packBehind, removePack, untilControlled, waitForUpdate} from './install';
import {isInstalled} from './state';
export type OfflineState =
 | {kind: 'hidden'}                                       // cannot be installed here
 | {kind: 'idle'; bytes?: number}
 | {kind: 'installing' | 'updating'; done: number; total: number}
 | {kind: 'installed'}
 | {kind: 'update'}                                       // installed, and a newer build is waiting
 | {kind: 'error'; message: string; during: 'install' | 'update'};
export interface Ops {
 isInstalled(): boolean; canInstall(): boolean;
 install(progress: (done: number, total: number) => void, signal: AbortSignal): Promise<void>;
 activate(): Promise<void>; controlled(): Promise<void>; remove(): Promise<void>;
 watchUpdate(onWaiting: () => void): Promise<void>; behind(): Promise<boolean>; size(): Promise<number | undefined>; reload(): void;
}
const SIZE_KEY = 'enoch.pack.bytes.v1';
export const defaultOps = (disposeCalculator: () => void): Ops => ({
 isInstalled, canInstall,
 install: async (progress, signal) => { await installPack(progress, undefined, signal); },
 activate: activateWaiting, controlled: untilControlled,
 remove: async () => { disposeCalculator(); await removePack(); },
 watchUpdate: waitForUpdate, behind: packBehind,
 // Only a label ("123 MB"): remembered on the device after the first look, so later loads ask for nothing. The installer and the
 // update check never use it; they read the live manifest themselves.
 size: async () => {
  try {
   const known = Number(localStorage.getItem(SIZE_KEY));
   if (known > 0) return known;
   const bytes = (await (await fetch('/offline-manifest.json')).json() as {bytes: number}).bytes;
   localStorage.setItem(SIZE_KEY, String(bytes));
   return bytes;
  } catch { return undefined; }
 },
 reload: () => location.reload(),
});

export function createOffline(ops: Ops) {
 let state: OfflineState = ops.isInstalled() ? {kind: 'installed'} : ops.canInstall() ? {kind: 'idle'} : {kind: 'hidden'};
 let abort: AbortController | undefined, bytes: number | undefined;
 const listeners = new Set<(s: OfflineState) => void>();
 const set = (s: OfflineState) => { state = s; listeners.forEach((l) => l(s)); };
 const idle = () => set({kind: 'idle', bytes});
 const message = (e: unknown) => e instanceof Error ? e.message : String(e);
 const start = () => {
  if (state.kind === 'installed' && ops.canInstall()) {
   const update = () => { if (state.kind === 'installed') set({kind: 'update'}); };
   ops.watchUpdate(update).catch(() => undefined);              // a newer build's worker is waiting
   ops.behind().then((b) => { if (b) update(); }).catch(() => undefined);   // or it already took over and this device's pack is still the old one
  }
  // The pack's size is not fetched here: only a device that is about to see it asks (loadSize), and an installed one never does.
 };
 let sizing = false;
 /** Learn the pack's size (one small request) for the idle state's text; once, and only when someone is about to read it. */
 const loadSize = () => {
  if (sizing || bytes !== undefined || state.kind !== 'idle') return;
  sizing = true;
  ops.size().then((b) => { bytes = b; if (state.kind === 'idle') idle(); }).catch(() => undefined).finally(() => { sizing = false; });
 };
 async function install() {
  if (state.kind !== 'idle' && !(state.kind === 'error' && state.during === 'install')) return;
  const mine = abort = new AbortController();
  set({kind: 'installing', done: 0, total: bytes ?? 1});
  try {
   await ops.install((done, total) => { if (!mine.signal.aborted) set({kind: 'installing', done, total}); }, mine.signal);
   await ops.activate();                                  // a newer worker may be waiting: the pack was installed for it
   await ops.controlled();
   set({kind: 'installed'});
  } catch (e) { if (mine.signal.aborted) idle(); else set({kind: 'error', message: message(e), during: 'install'}); }
 }
 const cancel = () => { if (state.kind === 'installing') abort?.abort(); };
 async function remove() { await ops.remove(); idle(); loadSize(); }
 async function update() {
  if (state.kind !== 'update' && !(state.kind === 'error' && state.during === 'update')) return;
  set({kind: 'updating', done: 0, total: 1});
  try {
   await ops.install((done, total) => set({kind: 'updating', done, total}), new AbortController().signal);
   await ops.activate();
   ops.reload();                                          // the new build's page must replace the old one
  } catch (e) { set({kind: 'error', message: message(e), during: 'update'}); }
 }
 return {
  get state() { return state; }, start, loadSize, install, cancel, remove, update,
  /** Re-run whichever action failed. */
  retry: () => state.kind === 'error' && state.during === 'update' ? update() : install(),
  subscribe(l: (s: OfflineState) => void) { listeners.add(l); l(state); return () => listeners.delete(l); },
 };
}
export type Offline = ReturnType<typeof createOffline>;
