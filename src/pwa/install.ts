// Install / update / remove the offline pack. Every file is downloaded (or reused from an older pack), checked against the
// SHA-256 and size in offline-manifest.json (written by scripts/stage-pwa.mjs), and only then stored in the cache the service
// worker serves from. The installed flag is set last, so a failed or interrupted install leaves the app as it was (online, downloading eras as needed); verified
// files already stored are kept and skipped on retry. A new build's worker waits: its pack is installed into its own cache while the
// old version keeps serving, and only then does it take over.
import {isInstalled, setInstalled} from './state';
type PackFile = {path: string; size: number; sha256: string};
export type PackManifest = {version: string; bytes: number; files: PackFile[]};
export type Progress = (doneBytes: number, totalBytes: number) => void;
export type Deps = {fetcher: typeof fetch; caches: CacheStorage; version: () => Promise<string>; stallMs?: number};
const PREFIX = 'enoch-pack-', MANIFEST_PATH = '/offline-manifest.json', STORED_PATH = '/installed-manifest.json', CONCURRENCY = 4, STALL_MS = 60000, READY_MS = 15000;
// The stored copy has its own key: the service worker must never answer the network's /offline-manifest.json from an old cache.

export const canInstall = () => import.meta.env.PROD && 'serviceWorker' in navigator && globalThis.isSecureContext && 'caches' in globalThis && !!globalThis.crypto?.subtle;

async function versionOf(worker: ServiceWorker | null | undefined): Promise<string> {
 if (!worker) throw new Error('Service worker is not active');
 return new Promise((resolve, reject) => {
  const channel = new MessageChannel(), timer = setTimeout(() => reject(new Error('Service worker did not answer')), 5000);
  channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(String(e.data)); };
  worker.postMessage('version', [channel.port2]);
 });
}
/** The version being installed: a waiting worker's if there is one (an update), otherwise the active worker's. */
async function targetVersion(): Promise<string> {
 // `ready` never settles if the worker could not be registered or activated (seen in a fresh Home Screen app): fail visibly instead of sitting at 0%.
 const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The offline service is not ready yet: close and reopen the app, then try again')), READY_MS))]);
 return versionOf(reg.waiting ?? reg.active);
}
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (n) => n.toString(16).padStart(2, '0')).join('');
const defaults = (): Deps => ({fetcher: (...a) => fetch(...a), caches: globalThis.caches, version: targetVersion});
const matches = async (file: PackFile, bytes: ArrayBuffer) => bytes.byteLength === file.size && hex(await crypto.subtle.digest('SHA-256', bytes)) === file.sha256;
/** Download a file, reporting bytes as they arrive (so progress moves on a slow link), and return it whole. */
async function download(fetcher: typeof fetch, path: string, signal: AbortSignal, onBytes: (n: number) => void): Promise<{bytes: ArrayBuffer; type: string | null}> {
 const r = await fetcher(path, {cache: 'no-store', signal});
 if (!r.ok) throw new Error(`${path} unavailable (HTTP ${r.status})`);
 const type = r.headers.get('Content-Type');
 if (!r.body) { const bytes = await r.arrayBuffer(); onBytes(bytes.byteLength); return {bytes, type}; }
 const reader = r.body.getReader(), chunks: Uint8Array[] = [];
 let length = 0;
 for (;;) {
  const {done, value} = await reader.read();
  if (done) break;
  chunks.push(value); length += value.length; onBytes(value.length);
 }
 const out = new Uint8Array(length);
 let at = 0;
 for (const c of chunks) { out.set(c, at); at += c.length; }
 return {bytes: out.buffer, type};
}
const paths = async (cache: Cache) => new Set((await cache.keys()).map((r) => new URL(r.url).pathname));

/** Older, complete-enough packs whose unchanged files can be reused without a download. */
async function priorPacks(caches: CacheStorage, except: string) {
 const found: {cache: Cache; sha: Map<string, string>}[] = [];
 for (const name of await caches.keys()) {
  if (!name.startsWith(PREFIX) || name === except) continue;
  const cache = await caches.open(name), stored = await cache.match(STORED_PATH);
  if (stored) found.push({cache, sha: new Map((await stored.json() as PackManifest).files.map((f) => [f.path, f.sha256]))});
 }
 return found;
}

/** `signal` cancels between files and aborts downloads in flight; what was verified stays stored, so a later install resumes.
 *  A download that makes no progress for `stallMs` is abandoned with an error, never left spinning. */
export async function installPack(progress: Progress = () => {}, deps: Deps = defaults(), signal?: AbortSignal): Promise<PackManifest> {
 const {fetcher, caches} = deps, stallMs = deps.stallMs ?? STALL_MS;
 const inner = new AbortController();
 let stalled = false, timer: ReturnType<typeof setTimeout> | undefined;
 const kick = () => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; inner.abort(); }, stallMs); };
 const onAbort = () => inner.abort();
 signal?.addEventListener('abort', onAbort);
 try {
  kick();
  const response = await fetcher(MANIFEST_PATH, {cache: 'no-store', signal: inner.signal});
  if (!response.ok) throw new Error(`Offline manifest unavailable (HTTP ${response.status})`);
  const manifest = await response.json() as PackManifest;
  if (manifest.version !== await deps.version()) throw new Error('A new version is waiting: reload, then install');
  const name = PREFIX + manifest.version, cache = await caches.open(name), prior = await priorPacks(caches, name);
  const have = await paths(cache);
  let done = manifest.files.filter((f) => have.has(f.path)).reduce((n, f) => n + f.size, 0), inflight = 0;
  const report = () => progress(Math.min(manifest.bytes, done + inflight), manifest.bytes);
  report();
  const queue = manifest.files.filter((f) => !have.has(f.path));
  const store = async (file: PackFile, bytes: ArrayBuffer, type: string | null) => {
   await cache.put(file.path, new Response(bytes, {headers: {'Content-Type': type ?? 'application/octet-stream'}}));
   done += file.size; kick(); report();
  };
  const worker = async () => {
   for (let file = queue.shift(); file; file = queue.shift()) {
    inner.signal.throwIfAborted();
    const old = prior.find((p) => p.sha.get(file.path) === file.sha256), hit = old && await old.cache.match(file.path);
    if (hit) {                                                       // unchanged since an older version: re-verified, not downloaded
     const bytes = await hit.arrayBuffer();
     if (await matches(file, bytes)) { await store(file, bytes, hit.headers.get('Content-Type')); continue; }
    }
    let got = 0;
    try {
     const {bytes, type} = await download(fetcher, file.path, inner.signal, (n) => { got += n; inflight += n; kick(); report(); });
     if (!await matches(file, bytes)) throw new Error(`${file.path} failed verification`);
     inflight -= got; got = 0;
     await store(file, bytes, type);
    } finally { inflight -= got; }
   }
  };
  // On the first failure stop taking new files, let in-flight ones finish storing (so a retry resumes), then report it.
  const results = await Promise.allSettled(Array.from({length: CONCURRENCY}, () => worker().catch((e) => { queue.length = 0; throw e; })));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw stalled ? new Error('The download stalled: check the connection and try again') : failed.reason;
  await cache.put(STORED_PATH, new Response(JSON.stringify(manifest), {headers: {'Content-Type': 'application/json'}}));
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  setInstalled(true);
  return manifest;
 } catch (e) {
  if (stalled) throw new Error('The download stalled: check the connection and try again');
  throw e;
 } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

/** True when the flagged pack is whole. Otherwise the flag is cleared and Install is offered again. Names only: no hashing at startup. */
export async function verifyInstalled(deps: Pick<Deps, 'caches'> = {caches: globalThis.caches}): Promise<boolean> {
 if (!isInstalled()) return false;
 try {
  for (const name of (await deps.caches.keys()).filter((n) => n.startsWith(PREFIX))) {
   const cache = await deps.caches.open(name), stored = await cache.match(STORED_PATH);
   if (!stored) continue;
   const manifest = await stored.json() as PackManifest, keys = await paths(cache);
   if (manifest.files.every((f) => keys.has(f.path))) return true;
  }
 } catch { /* unreadable storage counts as missing */ }
 setInstalled(false);
 return false;
}

/** Drop pack caches of versions no longer in use (the serving worker's and a waiting one's are kept). */
export async function pruneStale(keep: string[], deps: Pick<Deps, 'caches'> = {caches: globalThis.caches}): Promise<void> {
 const wanted = new Set(keep.map((v) => PREFIX + v));
 for (const name of await deps.caches.keys()) if (name.startsWith(PREFIX) && !wanted.has(name)) await deps.caches.delete(name);
}
export async function pruneStaleVersions(): Promise<void> {
 const reg = await navigator.serviceWorker?.getRegistration();
 if (!reg?.active || !navigator.serviceWorker.controller) return;
 // Only once the serving worker's own pack is complete: until then an older complete pack is what serves the app.
 if (await packBehind()) return;
 await pruneStale(await Promise.all([versionOf(navigator.serviceWorker.controller), ...(reg.waiting ? [versionOf(reg.waiting)] : [])]));
}

export async function removePack(deps: Pick<Deps, 'caches'> = {caches: globalThis.caches}): Promise<void> {
 setInstalled(false);
 for (const name of await deps.caches.keys()) if (name.startsWith(PREFIX)) await deps.caches.delete(name);
}

/** Resolves once a service worker controls this page (so the calculator's own fetches are served from the pack); gives up quietly after a few seconds. */
export async function untilControlled(): Promise<void> {
 await navigator.serviceWorker.ready;
 if (navigator.serviceWorker.controller) return;
 await new Promise<void>((resolve) => { navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {once: true}); setTimeout(resolve, 3000); });
}

/** True when this page's worker has no complete pack of its own (a new build the device has not updated to; an older pack still serves). */
export async function packBehind(): Promise<boolean> {
 const controller = navigator.serviceWorker?.controller;
 if (!controller) return false;
 const cache = await caches.open(PREFIX + await versionOf(controller));
 return !(await cache.match(STORED_PATH));
}

/** Is a newer build's worker waiting behind the one serving this page? */
export async function waitForUpdate(onWaiting: () => void): Promise<void> {
 const reg = await navigator.serviceWorker?.getRegistration();
 if (!reg) return;
 const check = () => { if (reg.waiting && navigator.serviceWorker.controller) onWaiting(); };
 check();
 reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', check));
}
/** Let the waiting worker take over (its pack must already be installed) and resolve once it controls the page. */
export async function activateWaiting(): Promise<void> {
 const reg = await navigator.serviceWorker.getRegistration();
 if (!reg?.waiting) return;
 const taken = new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {once: true}));
 reg.waiting.postMessage('activate');
 await taken;
}
