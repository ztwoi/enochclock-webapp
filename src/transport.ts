// The one transport, shared by every view: a single slim bar, like a media player.
//   [ Day | Degree ]  ◀◀  ◀  ▶  ▶▶  [ 1× ]          (Deep Time: [ Year ] in place of Day | Degree)
// Day: the hour holds and the date glides. Degree: the hour of the day runs, and the date follows
// when it passes sunrise. Year (Deep Time): the year runs, a year a second at 1×. ◀ plays in reverse, ▶ forward; tapping the one playing pauses. ◀◀ ▶▶
// step one day or one degree. The speed button cycles 0.5× → 16×. Day and Degree each remember
// their own speed and direction (localStorage), across views, pages and reloads; playback itself
// never resumes by itself after a load.
import './transport.css';
import { KEY, MODES, fmtSpeed, loadState, nextSpeed, type Dir, type Mode } from './transport-speed';

export interface TransportOpts {
  /** One step of the selected unit: a day or a degree (dir = ±1). */
  onStep(mode: Mode, dir: Dir): void;
  /** Playback started or stopped, or its unit, speed or direction changed. */
  onChange?(): void;
}
export interface Transport {
  /** The unit that is playing, else null. */
  readonly mode: Mode | null;
  /** The unit the bar is set to (Day where the view has no time of day). */
  readonly selected: Mode;
  /** A unit's remembered speed, signed by its direction. */
  speed(mode: Mode): number;
  /** Signed speed of what is playing, else 0. */
  rate(): number;
  play(dir?: Dir): void;
  pause(): void;
  /** Play in this direction (default: the remembered one), or pause if that is what is playing. */
  toggle(dir?: Dir): void;
  select(mode: Mode): void;
  cycleSpeed(): void;
  /** Degree needs a time of day; the year-level views have none. */
  setDegreeAvailable(on: boolean): void;
  /** Deep Time plays by year: the bar's unit is Year alone while it is on. */
  setYearView(on: boolean): void;
}

const NAME: Record<Mode, string> = { day: 'Day', degree: 'Degree', year: 'Year' };
const TITLE: Record<Mode, string> = { day: 'By day: the hour holds, the date glides', degree: 'By degree: the hour runs, the date follows at sunrise', year: 'By year: a year a second at 1×' };
const PER: Record<Mode, [number, string]> = { day: [2, 'days'], degree: [15, 'degrees'], year: [1, 'years'] };
const ICON = {
  fwd: '<svg viewBox="0 0 12 12"><path d="M2 0l10 6-10 6z"/></svg>', rev: '<svg viewBox="0 0 12 12"><path d="M10 0 0 6l10 6z"/></svg>',
  pause: '<svg viewBox="0 0 12 12"><path d="M2 0h3v12H2zM7 0h3v12H7z"/></svg>',
};

export function createTransport(root: HTMLElement, opts: TransportOpts): Transport {
  const s = loadState();
  let playing = false, degreeOk = true, yearView = false;
  const sel = (): Mode => (yearView ? 'year' : degreeOk ? s.mode : 'day');
  root.classList.add('tp');
  root.innerHTML = `
   <div class="tp-seg" role="group" aria-label="Play by">${[...MODES, 'year' as Mode].map((m) => `<button data-sel="${m}" aria-pressed="false" title="${TITLE[m]}">${NAME[m]}</button>`).join('')}</div>
   <div class="tp-seg tp-go" role="group" aria-label="Playback">
    <button data-step="-1" aria-label="Step back"><svg viewBox="0 0 20 12"><path d="M9 0 1 6l8 6zM19 0l-8 6 8 6z"/></svg></button>
    <button data-play="-1"></button>
    <button data-play="1"></button>
    <button data-step="1" aria-label="Step forward"><svg viewBox="0 0 20 12"><path d="M1 0l8 6-8 6zM11 0l8 6-8 6z"/></svg></button>
   </div>
   <button class="tp-speed" data-speed></button>`;
  const q = <T extends HTMLElement>(css: string) => root.querySelector<T>(css)!;

  function paint() {
    const m = sel(), u = s[m];
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-sel]')) {
      const on = b.dataset.sel === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      if (b.dataset.sel === 'degree') { b.disabled = !degreeOk; b.title = degreeOk ? TITLE.degree : 'No time of day in this view'; }
      b.hidden = yearView !== (b.dataset.sel === 'year');            // Deep Time: Year alone; elsewhere Day | Degree
    }
    for (const d of [-1, 1] as Dir[]) {
      const b = q<HTMLButtonElement>(`[data-play="${d}"]`), on = playing && u.dir === d;
      b.innerHTML = on ? ICON.pause : d > 0 ? ICON.fwd : ICON.rev; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Pause' : d > 0 ? 'Play forward' : 'Play in reverse');
    }
    const sp = q<HTMLButtonElement>('[data-speed]'); sp.textContent = fmtSpeed(u.speed);
    sp.setAttribute('aria-label', `Speed ${u.speed}×, tap to change`); sp.title = `${u.speed * PER[m][0]} ${PER[m][1]} a second · tap to change`;
    root.dataset.mode = playing ? m : '';
    root.dataset.selected = m;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: not remembered */ } };
  const changed = () => { save(); paint(); opts.onChange?.(); };
  const t: Transport = {
    get mode() { return playing ? sel() : null; },
    get selected() { return sel(); },
    speed: (m) => s[m].speed * s[m].dir,
    rate: () => (playing ? s[sel()].speed * s[sel()].dir : 0),
    play(dir) { if (dir) s[sel()].dir = dir; playing = true; changed(); },
    pause() { if (playing) { playing = false; changed(); } },
    toggle(dir) { if (playing && (!dir || s[sel()].dir === dir)) t.pause(); else t.play(dir); },
    select(m) { if (m === 'year' || yearView || (m === 'degree' && !degreeOk)) return; if (s.mode !== m) { s.mode = m; changed(); } },
    cycleSpeed() { const u = s[sel()]; u.speed = nextSpeed(u.speed); changed(); },
    setDegreeAvailable(on) {
      if (on === degreeOk) return;
      const was = sel(); degreeOk = on;
      if (was !== sel()) playing = false;                          // Degree was set where there is no hour to run
      paint(); opts.onChange?.();
    },
    setYearView(on) {
      if (on === yearView) return;
      playing = false; yearView = on;                              // the unit changes under it: stop
      paint(); opts.onChange?.();
    },
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b || b.disabled) return;
    if (b.dataset.sel) t.select(b.dataset.sel as Mode);
    else if (b.dataset.play) t.toggle(+b.dataset.play as Dir);
    else if (b.dataset.step) { t.pause(); opts.onStep(sel(), +b.dataset.step as Dir); }
    else if (b.dataset.speed !== undefined) t.cycleSpeed();
  });
  paint();
  return t;
}
