// Atlas's details: the site the year is calculated at, read from the calculator's year (sunrise azimuths, day lengths,
// times) and from the globe (the era's band, the overhead points), with the nearest preset place for a name.
import tzLookup from '@photostructure/tz-lookup';
import { fmt } from '../model';
import type { Site, YearDoc } from '../types';
import { band, bearingWord, nearest } from './geo';
import { places } from './places';
import type { AtlasInfo } from './view';

const lat = (x: number) => `${Math.abs(x).toFixed(4)}° ${x >= 0 ? 'N' : 'S'}`, lon = (x: number) => `${Math.abs(x).toFixed(4)}° ${x >= 0 ? 'E' : 'W'}`;
const hm = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;
const BAND = {
  tropic: ['Tropic', 'the Sun passes overhead twice a year; its line turns back on the Dial'],
  temperate: ['Temperate', ''],
  edge: ['Near the polar limit', 'a little further and the calculator refuses the year'],
  polar: ['Polar', 'the calculator refuses this latitude in this era'],
} as const;

/** The site a hand chose on the globe: a preset place within 25 km lends its zone and elevation (curated); otherwise the zone
 *  is estimated from the coordinates (tz-lookup: right in populated places, approximate near borders and at sea), and the
 *  elevation is sea level until set under Coordinates. */
export function siteAt(lat: number, lon: number): Site {
  const nb = nearest({ lat, lon }, places), near = nb && nb.km < 25 ? nb.place : null;
  let tz = near?.tz ?? 'UTC';
  if (!near) try { tz = tzLookup(lat, lon); } catch { /* UTC */ }
  return { name: siteName({ lat, lon, name: '' }).name, lat, lon, elev: near?.elev ?? 0, tz, source: 'manual' };
}

/** The name a site goes by: a preset place within 2 km (with its region); else its own name, if it has one ("Here"); else
 *  how far and which way from the nearest preset place ("12 km E of Jerusalem"). */
export function siteName(s: { lat: number; lon: number; name: string }) {
  const nb = nearest(s, places);
  if (nb && nb.km < 2) return { name: nb.place.name, sub: nb.place.region };
  if (s.name && s.name !== 'Custom site') return { name: s.name, sub: '' };
  return { name: nb ? `${Math.round(nb.km)} km ${bearingWord(nb.place, s)} of ${nb.place.name}` : 'Custom site', sub: '' };
}

export function atlasPanel(doc: YearDoc, i: number, info: AtlasInfo | null, name = 'Custom site'): string {
  const c = doc.calculation, nm = siteName({ lat: c.latitude, lon: c.longitude_east, name });
  const az = doc.rows.slice(0, -1).map((r) => r.azimuth_deg), north = Math.min(...az), south = Math.max(...az);
  const hours = doc.extended.map((e) => e.day_hours), b = BAND[band(c.latitude, doc.rows[i].sunrise_jd_ut)];
  const dd = (k: string, v: string, cls = '') => `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd>`;
  const over = (p: { lat: number; lon: number }) => `${lat(p.lat)} · ${lon(p.lon)}`;
  return `<div class="section atlas-site">
    <div class="eyebrow">Atlas · the site</div>
    <div class="at-name"><span class="n">${nm.name}</span>${nm.sub ? `<span class="s">${nm.sub}</span>` : ''}</div>
    <div class="at-coords">${lat(c.latitude)} · ${lon(c.longitude_east)}</div>
    <dl class="read">${dd('Time zone', `${c.timezone} · UTC${fmt.offset(doc.rows[i].sunrise_local)}`)}${dd('Elevation', `${Math.round(c.elevation_m)} m`)}${dd('Band', b[0], 'cal')}</dl>
    ${b[1] ? `<p class="note">${b[1][0].toUpperCase()}${b[1].slice(1)}.</p>` : ''}
    <dl class="read">${dd('Portals', `${north.toFixed(1)}° – ${south.toFixed(1)}° · ${(south - north).toFixed(1)}° wide`, 'cal')}${dd('Longest day', hm(Math.max(...hours)))}${dd('Shortest day', hm(Math.min(...hours)))}${dd('This day', `${fmt.time(doc.rows[i].sunrise_local).slice(0, 5)} – ${fmt.time(doc.extended[i].sunset_local).slice(0, 5)}`)}</dl>
    <p class="note">Drag the globe to move the site under the crosshair; the year is calculated where you let go.</p>
    <p style="margin-top:12px"><button class="btn" data-atlas-coords>Coordinates, elevation, my location…</button></p>
  </div>
  ${info ? `<div class="section">
    <div class="eyebrow">The globe at this instant</div>
    <dl class="read">${dd('Sun overhead', over(info.sun))}${dd('Moon overhead', over(info.moon))}${dd('Tropics', `${info.obliquity.toFixed(3)}°`)}${dd('Polar limit', `${info.polarLimit.toFixed(1)}°`)}</dl>
    <p class="note">The tropics move with the tilt of the Earth's axis, and the polar limit with them: beyond it some day of
    the year has no sunrise, and the calculator refuses the year. Over the site, the camera turns with the Earth and the site
    stays under the crosshair; from the stars, the sky holds still and the Earth turns under it. The coastlines are today's.</p>
  </div>` : ''}`;
}
