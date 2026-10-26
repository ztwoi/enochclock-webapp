// The accuracy section: how far to trust the loaded year, and why. Open by
// default only when the year is beyond the bounds; inside them it is a one-line summary to expand.
import { yearLabel } from './dates';
import type { Accuracy } from './types';

const sgn = (v: number, n = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(n)}`;
function span(s: number) {
  const a = Math.abs(s);
  return a < 120 ? `${a.toFixed(0)} s` : a < 7200 ? `${(a / 60).toFixed(0)} min` : a < 172800 ? `${(a / 3600).toFixed(1)} h` : `${(a / 86400).toFixed(1)} days`;
}

/** A short marker for the date line when the year is beyond the bounds. */
export const accuracyFlag = (a?: Accuracy) => (a && !a.within_bounds ? ' <span class="acc-flag" data-k="acc-flag" title="Beyond the accuracy bounds: see Accuracy in the details">≈ beyond<span class="acc-w"> accuracy</span> bounds</span>' : '');

/** Beyond this many years from 2000 the drawn stars are indicative only (see the note below). */
const STAR_YEARS = 3000;
const STARS = (y: number) => `<p class="note acc-why" data-k="acc-stars"><b>Star positions.</b> ${Math.abs(y - 2000).toLocaleString('en-US')} years from 2000, the star field is indicative: bright nearby stars can be degrees from where they really were.</p>`;

export function accuracySection(a?: Accuracy, opts: { stars?: boolean } = {}): string {
  if (!a) return '';
  const starNote = opts.stars && Math.abs(a.day1_year - 2000) > STAR_YEARS ? STARS(a.day1_year) : '';
  const b = a.bounds, aligned = Math.abs(a.day1_offset_days) <= b.alignment_days, clock = a.delta_t_sigma_s <= b.delta_t_sigma_s;
  const mark = (ok: boolean) => (ok ? '' : ' class="acc-bad"');
  return `<details class="section acc ${a.within_bounds ? 'ok' : 'out'}" data-k="accuracy" ${a.within_bounds ? '' : 'open'}>
   <summary><span class="eyebrow">Accuracy</span> <span class="acc-state">${a.within_bounds ? 'within bounds' : 'beyond bounds'}</span>
    <span class="acc-sum">Day 1 ${sgn(a.day1_offset_days)} d from the equinox</span></summary>
   <dl class="read">
    <dt${mark(aligned)}>Day 1 − equinox</dt><dd${mark(aligned)} data-k="acc-offset">${sgn(a.day1_offset_days)} d <small>(uniform time; bound ±${b.alignment_days})</small></dd>
    <dt>Day 1 sunrise − equinox</dt><dd>${sgn(a.day1_sunrise_minus_equinox_ut_days)} d <small>(clock time, UT)</small></dd>
    <dt>This calendar year</dt><dd>${a.calendar_year_days} days</dd>
    <dt>Calendar's average year</dt><dd>${a.calendar_mean_year_days.toFixed(5)} d</dd>
    <dt>Equinox year here</dt><dd data-k="acc-year">${a.mean_equinox_year_days.toFixed(5)} d <small>(mean ${yearLabel(a.mean_equinox_year_span[0])}–${yearLabel(a.mean_equinox_year_span[1])})</small></dd>
    <dt>Drift</dt><dd>${sgn(a.drift_days_per_millennium)} d per 1,000 years</dd>
    <dt${mark(clock)}>ΔT (uniform − Earth time)</dt><dd${mark(clock)} data-k="acc-dt">${span(a.delta_t_s)} ± ${span(a.delta_t_sigma_s)}</dd>
    <dt>Best span (±${b.alignment_days} d)</dt><dd>${yearLabel(b.best_span.first_year)} – ${yearLabel(b.best_span.last_year)} · ${b.best_span.years.toLocaleString('en-US')} years</dd>
   </dl>
   ${a.reasons.map((r) => `<p class="note acc-why" data-k="acc-${r.key}"><b>${r.title}.</b> ${r.detail}</p>`).join('')}${starNote}
  </details>`;
}
