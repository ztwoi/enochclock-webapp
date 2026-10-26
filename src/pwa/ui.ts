// Offline in the instrument's own language: one quiet section at the foot of the inspector (the side column, or the Details sheet on
// phones and tablets), the top bar's calculator icon as its status, a gold dot on ⋯ when an update waits, and a once-only invitation.
import './offline.css';
import {createOffline, defaultOps, type Offline, type OfflineState} from './controller';
import {homeScreenKind, onHomeScreenChange, promptHomeScreen} from './homescreen';
const DISMISSED = 'enoch.offline.invite.v1', FILM_SEEN = 'enoch.film.seen.v1', INVITE_DELAY = 6000;
const mb = (b: number) => `${Math.max(1, Math.round(b / 1048576))} MB`;
const store = (k: string) => { try { return !!localStorage.getItem(k); } catch { return true; } };
const mark = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* private mode */ } };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
 const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
const percent = (s: OfflineState) => s.kind === 'installing' || s.kind === 'updating' ? Math.min(100, Math.floor(100 * s.done / s.total)) : 0;

// The top bar's calculator status: a device icon (every calculation runs here; nothing is sent anywhere), quiet while all is well.
// What is kept on the device, the version and a waiting update live in the tooltip; the icon pulses while a year is calculated.
const DEVICE = '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M8 20h8M12 16v4"/>';
let chipEl: HTMLElement | undefined, offlineActive = false, hasUpdate = false;
function paintChip(): void {
 if (!chipEl) return;
 const label = 'Calculating on this device · ' + (offlineActive ? 'every era kept for offline use' : 'eras you visit are kept on this device')
  + (hasUpdate ? ' · update ready' : '');
 chipEl.dataset.mode = offlineActive ? 'offline' : 'local'; chipEl.title = label; chipEl.setAttribute('aria-label', label);
 chipEl.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DEVICE}</svg>`;
 chipEl.classList.toggle('has-update', hasUpdate);
}
let inFlight = 0;
/** A year is being calculated: the icon pulses while any load is in flight. Calls pair up: true, then false. */
export function setCalcBusy(on: boolean): void { inFlight = Math.max(0, inFlight + (on ? 1 : -1)); chipEl?.classList.toggle('busy', inFlight > 0); }

export interface MountOpts { after: HTMLElement; stage: HTMLElement; chip: HTMLElement; more: HTMLElement; disposeCalculator(): void; openDetails(): void }
export function mountOffline(o: MountOpts): Offline {
 const offline = createOffline(defaultOps(o.disposeCalculator));
 chipEl = o.chip; paintChip();

 const section = el('div', 'section offline'); section.id = 'offline';
 const main = el('button', 'btn on offline-main'), meta = el('p', 'offline-meta'), err = el('p', 'offline-err'), links = el('div', 'offline-links'), home = el('div', 'offline-links');
 err.setAttribute('role', 'status');
 section.append(el('div', 'eyebrow', 'Offline'), main, err, meta, links, home);
 o.after.after(section);
 // The pack size (one small request) is learned when the section is first on screen, not on every page load.
 if ('IntersectionObserver' in window) new IntersectionObserver((seen, io) => { if (seen.some((e) => e.isIntersecting)) { offline.loadSize(); io.disconnect(); } }).observe(section);
 else offline.loadSize();
 let confirming = false;
 main.onclick = () => { const s = offline.state; if (s.kind === 'update') void offline.update(); else if (s.kind === 'error') void offline.retry(); else void offline.install(); };
 const link = (text: string, run: () => void) => { const b = el('button', 'link', text); b.onclick = run; return b; };

 function render(s: OfflineState) {
  section.hidden = s.kind === 'hidden';
  const busy = s.kind === 'installing' || s.kind === 'updating', installed = s.kind === 'installed' || s.kind === 'update';
  main.hidden = s.kind === 'installed'; main.disabled = busy;
  main.style.setProperty('--p', `${percent(s)}%`);
  main.textContent = s.kind === 'installing' ? `Installing ${percent(s)}%` : s.kind === 'updating' ? `Updating ${percent(s)}%` : s.kind === 'update' ? 'Update' : s.kind === 'error' ? 'Try again' : 'Install for offline use';
  err.hidden = s.kind !== 'error'; err.textContent = s.kind === 'error' ? s.message : '';
  meta.textContent = s.kind === 'idle' ? `Every era (${s.bytes ? `${mb(s.bytes)}, ` : ''}all 30,000 years) kept on this device, so the app opens without a connection` : installed ? (s.kind === 'update' ? 'Installed · a newer version is ready' : 'Installed · works offline') : '';
  meta.hidden = !meta.textContent;
  links.replaceChildren();
  if (s.kind === 'installing') links.append(link('Cancel', () => offline.cancel()));
  if (installed) {
   if (confirming) links.append(el('span', 'offline-meta', 'Remove offline data?'), link('Yes', () => { confirming = false; void offline.remove(); }), link('No', () => { confirming = false; render(offline.state); }));
   else links.append(link('Remove', () => { confirming = true; render(offline.state); }));
  } else confirming = false;
  home.replaceChildren();
  const kind = installed || s.kind === 'idle' ? homeScreenKind() : 'none';
  if (kind === 'prompt' && installed) home.append(link('Add to Home Screen', () => void promptHomeScreen()));
  // iOS keeps a Home Screen app's data apart from Safari's: what is installed in a Safari tab is not there for the icon.
  if (kind === 'ios') home.append(el('span', 'offline-meta', 'Home Screen: Share, then Add to Home Screen. That app keeps its own offline data, so install there too.'));
  // the chip is the calculator's status; the dot on ⋯ says an update is waiting
  offlineActive = installed;
  hasUpdate = s.kind === 'update'; paintChip();
  o.more.classList.toggle('update-dot', s.kind === 'update');
 }
 offline.subscribe(render);
 onHomeScreenChange(() => render(offline.state));
 o.chip.addEventListener('click', () => { o.openDetails(); section.scrollIntoView({block: 'nearest', behavior: 'smooth'}); if (!main.hidden) main.focus({preventScroll: true}); });
 offline.start();
 invite(offline, o.stage);
 return offline;
}

/** Once, on a later visit than the film's invitation (never stacked with it): offer to keep the instrument on the device. */
function invite(offline: Offline, stage: HTMLElement) {
 if (store(DISMISSED) || !store(FILM_SEEN) || homeScreenKind() === 'ios') return;   // not in an iOS Safari tab: the Home Screen app has its own data
 setTimeout(() => {
  if (offline.state.kind !== 'idle') return;
  const card = el('div', 'offline-invite'), go = el('button', 'btn on offline-go', 'Install'), no = el('button', 'film-no', '✕'), info = el('span');
  card.setAttribute('role', 'status'); no.setAttribute('aria-label', 'Dismiss');
  const text = el('div'); text.append(el('b', '', 'Keep it on this device'), info);
  card.append(text, go, no); stage.append(card); offline.loadSize();
  const done = () => { card.remove(); mark(DISMISSED); unsubscribe(); };
  const unsubscribe = offline.subscribe((s) => {
   info.textContent = s.kind === 'idle' && s.bytes ? `Works offline · ${mb(s.bytes)}` : 'Works offline';
   go.disabled = s.kind === 'installing'; go.textContent = s.kind === 'installing' ? `${percent(s)}%` : s.kind === 'error' ? 'Try again' : 'Install';
   if (s.kind === 'installed' || s.kind === 'update' || s.kind === 'hidden') done();
  });
  go.onclick = () => void (offline.state.kind === 'error' ? offline.retry() : offline.install());
  no.onclick = done;
 }, INVITE_DELAY);
}
