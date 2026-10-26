// The film: "The courses of the luminaries" (film/src/sun, rendered to public/film). A Watch button in the top bar opens
// it in a full-screen player over the app; the first visit shows a small invitation, remembered once seen or dismissed.
// The video loads only when the player opens (phones get the 720p file).
import './film.css';

const SEEN = 'enoch.film.seen.v1';
const seen = () => { try { return !!localStorage.getItem(SEEN); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ } };

export function createFilm(button: HTMLElement, root: HTMLElement) {
  const dlg = document.createElement('dialog');
  dlg.className = 'film'; dlg.setAttribute('aria-label', 'Film: the courses of the luminaries');
  dlg.innerHTML = `<button class="film-x" aria-label="Close the film">✕</button>
    <div class="film-stage"><video class="film-v" controls controlslist="nofullscreen" playsinline preload="none" poster="/film/sun-poster.jpg"></video>
      <button class="film-fs" aria-label="Full screen" title="Full screen">⤢</button></div>
    <div class="film-cue" aria-live="polite"><p class="film-cue-t"></p><p class="film-cue-r"></p></div>`;
  root.append(dlg);
  const video = dlg.querySelector('video')!, stage = dlg.querySelector<HTMLElement>('.film-stage')!;
  const cueBox = dlg.querySelector<HTMLElement>('.film-cue')!, cueT = dlg.querySelector<HTMLElement>('.film-cue-t')!, cueR = dlg.querySelector<HTMLElement>('.film-cue-r')!;

  // The verses: not in the picture but laid over it as live text, so they size to the screen (film/src/sun/cues.ts).
  interface Cue { start: number; end: number; text: string; ref: string }
  let cues: Cue[] = [], fade = .6, shown: Cue | null = null, raf = 0;
  const loadCues = () => (cues.length ? Promise.resolve() : fetch('/film/sun-cues.json').then((r) => r.json()).then((j) => { cues = j.cues; fade = j.fade; }).catch(() => undefined));
  const tick = () => {
    const t = video.currentTime, c = cues.find((x) => t >= x.start && t < x.end) ?? null;
    if (c !== shown) { shown = c; cueT.textContent = c?.text ?? ''; cueR.textContent = c?.ref ?? ''; }
    cueBox.style.opacity = c ? String(Math.max(0, Math.min(1, (t - c.start) / fade, (c.end - t) / fade))) : '0';
    raf = requestAnimationFrame(tick);
  };
  // Where the verse goes: below the picture when the screen has room (an upright phone, most desktops); otherwise (a
  // phone on its side, full screen) a slim line along the picture's bottom edge, clear of the view.
  const BELOW = 150;
  const layout = () => {
    const full = document.fullscreenElement === stage, vw = full ? innerWidth : dlg.clientWidth || innerWidth, vh = full ? innerHeight : dlg.clientHeight || innerHeight;
    const below = !full && vh >= 520;                       // room under the picture: everything but a phone on its side or full screen
    const w = below ? Math.min(vw, (vh - BELOW) * 16 / 9) : Math.min(vw, vh * 16 / 9);
    if (!full) stage.style.width = `${Math.floor(w)}px`;
    cueBox.classList.toggle('below', below); cueBox.classList.toggle('over', !below);
    cueBox.style.width = below ? `${Math.floor(w)}px` : '';
    if (below && cueBox.parentElement !== dlg) dlg.append(cueBox); else if (!below && cueBox.parentElement !== stage) stage.append(cueBox);
  };
  addEventListener('resize', () => { if (dlg.open) layout(); });
  // over the picture, the verse keeps clear of the player's controls while they show (paused)
  const lift = () => cueBox.classList.toggle('lift', video.paused);
  video.addEventListener('play', lift); video.addEventListener('pause', lift);
  document.addEventListener('fullscreenchange', () => { if (dlg.open) layout(); });
  // full screen on the stage, not the video, so the verses come too (where the browser allows it; an iPhone does not)
  const fs = dlg.querySelector<HTMLButtonElement>('.film-fs')!;
  fs.hidden = !stage.requestFullscreen;
  fs.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen()).catch(() => undefined));
  const src = () => (matchMedia('(max-width: 700px)').matches ? '/film/sun-720.mp4' : '/film/sun-1080.mp4');

  const open = () => {
    invite.remove(); markSeen();
    if (!video.src) video.src = src();
    dlg.showModal(); layout(); lift(); loadCues().then(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
    video.play().catch(() => undefined);
  };
  const close = () => { video.pause(); dlg.close(); };
  button.addEventListener('click', open);
  dlg.querySelector('.film-x')!.addEventListener('click', close);
  dlg.addEventListener('close', () => { video.pause(); cancelAnimationFrame(raf); if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); });                         // Escape closes the dialog too
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });   // a click outside the picture

  // the first visit: an invitation over the stage's corner
  const invite = document.createElement('div');
  invite.className = 'film-invite'; invite.setAttribute('role', 'status');
  invite.innerHTML = `<img src="/film/sun-poster.jpg" alt=""><div><b>New here?</b><span>Watch the story of the clock · 2 min</span></div>
    <button class="btn on film-go">Watch</button><button class="film-no" aria-label="Dismiss">✕</button>`;
  if (!seen()) document.getElementById('stage')?.append(invite);
  invite.querySelector('.film-go')!.addEventListener('click', open);
  invite.querySelector('.film-no')!.addEventListener('click', () => { invite.remove(); markSeen(); });
  return { open, close };
}
