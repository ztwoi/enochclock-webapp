// Atlas mock-up (docs/atlas.md, A.1). A working sketch of the view, not the build: the Sun, Moon, planets, stars
// and sidereal time are astronomy-engine's (the app's dependency); the Enoch date is approximated here (Day 1 = the
// local date of the March equinox, months 30·30·31, no holds) where the app has its calculator.
/* global Astronomy */
const A = Astronomy, D = Math.PI / 180, $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), mix = (a, b, f) => a + (b - a) * f;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const [LAND, PLACES] = await Promise.all([fetch('land.json').then((r) => r.json()), fetch('../../src/atlas/places.json').then((r) => r.json()).then((j) => j.places)]);

// ---------- state ----------
const P0 = new URLSearchParams(location.search);
const jer = PLACES.find((p) => p.name === 'Jerusalem');
const S = {
  site: P0.get('lat') ? { name: P0.get('name') ?? 'Custom site', lat: +P0.get('lat'), lon: +P0.get('lon'), elev: +(P0.get('elev') ?? 0), tz: P0.get('tz') ?? 'UTC' } : { ...jer },
  t: Date.parse(P0.get('at') ?? '') || Date.now(),
  cam: 'site', starLon: 0, center: null, zoom: 1,
  layers: { terminator: true, tropics: true, polar: true, bodies: true, stars: true, grid: true },
  cal: 'greg', tm: 'clock', list: 'saved', tags: new Set(), q: '',
  calc: 'done', play: 0, mode: 'degree', speed: 1, tab: 'where', dragging: false,
};
S.center = { lat: S.site.lat, lon: S.site.lon };

// ---------- geometry ----------
const vec = (lat, lon) => [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
function basis(lat, lon) {
  const c = vec(lat, lon), e = [-Math.sin(lon * D), Math.cos(lon * D), 0], n = [-Math.sin(lat * D) * Math.cos(lon * D), -Math.sin(lat * D) * Math.sin(lon * D), Math.cos(lat * D)];
  return { c, e, n };
}
function haversineKm(a, b) {
  const s = Math.sin((b.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin((b.lon - a.lon) * D / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
function bearingWord(a, b) {
  const y = Math.sin((b.lon - a.lon) * D) * Math.cos(b.lat * D), x = Math.cos(a.lat * D) * Math.sin(b.lat * D) - Math.sin(a.lat * D) * Math.cos(b.lat * D) * Math.cos((b.lon - a.lon) * D);
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((Math.atan2(y, x) / D) + 360) % 360) / 45) % 8];
}
const nearest = (p) => PLACES.map((q) => ({ q, km: haversineKm(p, q) })).sort((a, b) => a.km - b.km)[0];

// ---------- time ----------
const atime = (t) => A.MakeTime(new Date(t));
const yearOfT = (t) => new Date(t).getUTCFullYear();
/** Obliquity of the ecliptic (Laskar 1986), degrees. */
function obliquity(t) {
  const u = (t / 86400000 + 2440587.5 - 2451545) / 3652500;
  const c = [84381.448, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45];
  return c.reduce((s, k, i) => s + k * u ** i, 0) / 3600;
}
const polarLimit = (t) => 90 - obliquity(t) - 0.9;   // ~65.7° in 2026 (probed against enoch/almanac.py: 65.6 ok, 66.0 refused)
/** ΔT's uncertainty, seconds (Morrison & Stephenson 2004: about 0.8 t², t in centuries from 1820). */
const dtSigma = (y) => (y > 1600 && y < 2100 ? 0 : 0.8 * ((y - 1820) / 100) ** 2);
function offsetMin(tz, t) {
  const y = yearOfT(t);
  if (y >= 2 && y <= 9998) {
    try {
      const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(t)).find((x) => x.type === 'timeZoneName').value;
      const m = /GMT([+-])(\d\d):?(\d\d)?/.exec(s); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0)) : 0;
    } catch { /* fall through */ }
  }
  return Math.round(S.site.lon * 4);                       // local mean time
}
const utc = (y, mo, d, h = 0, mi = 0) => { const x = new Date(0); x.setUTCFullYear(y, mo - 1, d); x.setUTCHours(h, mi, 0, 0); return x.getTime(); };
function local(t) { const o = offsetMin(S.site.tz, t), x = new Date(t + o * 60000); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), s: x.getUTCSeconds(), o }; }
function fromLocal(y, mo, d, h, mi) { let t = utc(y, mo, d, h, mi); for (let k = 0; k < 2; k++) t = utc(y, mo, d, h, mi) - offsetMin(S.site.tz, t) * 60000; return t; }
const p2 = (n) => String(n).padStart(2, '0');
const yearText = (y) => (y <= 0 ? `${1 - y} BCE` : `${y}`);
const offText = (o) => `${o < 0 ? '−' : '+'}${Math.floor(Math.abs(o) / 60)}${Math.abs(o) % 60 ? ':' + p2(Math.abs(o) % 60) : ''}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const daysIn = (y, mo) => [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];

const observer = () => new A.Observer(S.site.lat, S.site.lon, S.site.elev || 0);
function riseSet(dir, t, back) {
  try { const r = A.SearchRiseSet(A.Body.Sun, observer(), dir, atime(t), back ? -1.2 : 1.2); return r ? r.date.getTime() : null; } catch { return null; }
}
/** Enoch (approximate, see the header): the day runs sunrise to sunrise; Day 1 is the March equinox's local date. */
const ENOCH_OFFSET = 12752, ELEN = [30, 30, 31, 30, 30, 31, 30, 30, 31, 30, 30, 31];
function day1(y) { const e = local(A.Seasons(y).mar_equinox.date.getTime()); return utc(e.y, e.mo, e.d); }
function enochOf(t) {
  const rise = riseSet(+1, t, true) ?? t, L = local(rise);
  let y = L.y, d0 = day1(y); const day = utc(L.y, L.mo, L.d);
  if (day < d0) { y -= 1; d0 = day1(y); }
  let n = Math.round((day - d0) / 86400000), mon = 0;
  while (mon < 11 && n >= ELEN[mon]) n -= ELEN[mon++];
  return { ey: y + ENOCH_OFFSET, mon: mon + 1, day: n + 1, gy: y };
}
function enochToT(ey, mon, day, partOrNull) {
  const gy = ey - ENOCH_OFFSET, d0 = day1(gy);
  const n = ELEN.slice(0, mon - 1).reduce((a, b) => a + b, 0) + (day - 1), L = new Date(d0 + n * 86400000);
  const noon = fromLocal(L.getUTCFullYear(), L.getUTCMonth() + 1, L.getUTCDate(), 12, 0), rise = riseSet(+1, noon, true) ?? noon;
  return rise + (partOrNull ?? 0) * dayLen(rise) / 18;
}
const dayLen = (rise) => (riseSet(+1, rise + 60000) ?? rise + 86400000) - rise;
function partOf(t) { const rise = riseSet(+1, t, true); if (rise == null) return null; return (t - rise) / dayLen(rise) * 18; }

// ---------- the day: sunrise to sunrise and what happens in it (as src/day/events.ts) ----------
const SUN_COLOR = '#f4dc9f', MOON_COLOR = '#d8d2c4';
const PCOL = { Mercury: '#c4a98a', Venus: '#f6e6b0', Mars: '#c76b4a', Jupiter: '#e0b878', Saturn: '#d8b45e', Uranus: '#9cc7c9', Neptune: '#7c95c9' };
let dayCache = null;
function theDay(t) {
  const a = riseSet(+1, t, true) ?? t - 43200000, key = `${S.site.lat},${S.site.lon},${Math.round(a / 60000)}`;
  if (dayCache?.key === key) return dayCache;
  const b = riseSet(+1, a + 60000) ?? a + 86400000, obs = observer(), out = [];
  const add = (ms, body, kind, color) => { if (ms != null && ms >= a && ms < b) out.push({ t: ms, part: 18 * (ms - a) / (b - a), body, kind, color }); };
  const ha = (h) => { try { return A.SearchHourAngle(A.Body.Sun, obs, h, atime(a)).time.date.getTime(); } catch { return null; } };
  add(a, 'Sun', 'rise', SUN_COLOR); add(riseSet(-1, a), 'Sun', 'set', SUN_COLOR); add(ha(0), 'Sun', 'noon', SUN_COLOR); add(ha(12), 'Sun', 'midnight', SUN_COLOR);
  for (const [name, color] of [...Object.entries(PCOL), ['Moon', MOON_COLOR]]) for (const dir of [1, -1])
    for (let from = a; from < b;) {
      let r = null; try { r = A.SearchRiseSet(A.Body[name], obs, dir, atime(from), (b - from) / 86400000); } catch { /* none */ }
      if (!r) break; const ms = r.date.getTime(); add(ms, name, dir > 0 ? 'rise' : 'set', color); from = ms + 60000;
    }
  out.sort((x, y) => x.t - y.t);
  const sunset = out.find((e) => e.body === 'Sun' && e.kind === 'set');
  return (dayCache = { key, a, b, events: out, dp: sunset ? sunset.part : 9 });
}
const evName = (e) => e.body === 'Sun' ? { rise: 'Sunrise', set: 'Sunset', noon: 'Midday', midnight: 'Midnight' }[e.kind] : `${e.body} ${e.kind === 'rise' ? 'rises' : 'sets'}`;

// ---------- sky ----------
const BRIGHT = [['Sirius', 6.752, -16.716, -1.46], ['Canopus', 6.399, -52.696, -0.74], ['Arcturus', 14.261, 19.182, -0.05], ['Rigil Kentaurus', 14.66, -60.834, -0.27],
  ['Vega', 18.616, 38.784, 0.03], ['Capella', 5.278, 45.998, 0.08], ['Rigel', 5.242, -8.202, 0.13], ['Procyon', 7.655, 5.225, 0.34], ['Achernar', 1.629, -57.237, 0.46],
  ['Betelgeuse', 5.919, 7.407, 0.5], ['Hadar', 14.064, -60.373, 0.61], ['Altair', 19.846, 8.868, 0.76], ['Acrux', 12.443, -63.099, 0.76], ['Aldebaran', 4.599, 16.509, 0.86],
  ['Antares', 16.49, -26.432, 0.96], ['Spica', 13.42, -11.161, 0.97], ['Pollux', 7.755, 28.026, 1.14], ['Fomalhaut', 22.961, -29.622, 1.16], ['Deneb', 20.69, 45.28, 1.25],
  ['Regulus', 10.139, 11.967, 1.35], ['Polaris', 2.53, 89.264, 1.98], ['Pleiades', 3.791, 24.105, 1.6]];
const STARS = BRIGHT.map(([name, ra, dec, mag]) => ({ name, j: vec(dec, ra * 15), mag }));
{ let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 900; k++) { const z = rnd() * 2 - 1, a = rnd() * 2 * Math.PI, r = Math.sqrt(1 - z * z); STARS.push({ j: [r * Math.cos(a), r * Math.sin(a), z], mag: 2.6 + 3.6 * Math.sqrt(rnd()) }); } }
let starCache = { t: NaN, v: [] };
function starsOfDate(t) {                                  // precession and nutation to the date: the star field of the era
  if (Math.abs(t - starCache.t) < 86400000 * 3) return starCache.v;
  const r = A.Rotation_EQJ_EQD(atime(t)), at = atime(t);
  starCache = { t, v: STARS.map((s) => { const q = A.RotateVector(r, new A.Vector(s.j[0], s.j[1], s.j[2], at)); return [q.x, q.y, q.z]; }) };
  return starCache.v;
}
const BODIES = [['Sun', '#f4dc9f'], ['Moon', '#cfd8da'], ['Mercury', '#b9a98f'], ['Venus', '#f1e6c4'], ['Mars', '#d07a58'], ['Jupiter', '#e0c69a'], ['Saturn', '#d9c27f']];
function bodiesOfDate(t) {
  const at = atime(t), r = A.Rotation_EQJ_EQD(at);
  return BODIES.map(([name, col]) => { const q = A.RotateVector(r, A.GeoVector(A.Body[name], at, true)), m = Math.hypot(q.x, q.y, q.z); return { name, col, v: [q.x / m, q.y / m, q.z / m] }; });
}
/** Equatorial-of-date → Earth-fixed: turn by the Greenwich apparent sidereal angle. */
function toEarth(v, gst) { const c = Math.cos(gst), s = Math.sin(gst); return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]]; }
const subPoint = (v) => ({ lat: Math.asin(v[2]) / D, lon: Math.atan2(v[1], v[0]) / D });

// ---------- land: equirectangular mask for the fill, unit vectors for the coast ----------
const MW = 4096, MH = 2048;
const mask = (() => {
  const c = new OffscreenCanvas(MW, MH), g = c.getContext('2d');
  g.beginPath();
  for (const r of LAND) r.forEach(([lo, la], k) => { const x = (lo + 180) / 360 * MW, y = (90 - la) / 180 * MH; k ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.fillStyle = '#fff'; g.fill('evenodd');
  const d = g.getImageData(0, 0, MW, MH).data, m = new Uint8Array(MW * MH);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
  return m;
})();
const COAST = LAND.map((r) => ({ v: r.map(([lo, la]) => vec(la, lo)), skip: r.map(([lo, la], k) => k > 0 && (la <= -89.9 || r[k - 1][1] <= -89.9 || Math.abs(lo - r[k - 1][0]) > 180 || (Math.abs(lo) >= 179.99 && lo === r[k - 1][0]))) }));

// ---------- drawing ----------
const cv = $('globe'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, raster = null, rasterCtx = null, rasterScale = 0;
function geom() { const R0 = Math.min(W * 0.92, H * 0.86) / 2, R = R0 * S.zoom, phone = W < 700; return { R, cx: W / 2, cy: H / 2 + (phone ? 14 : 22) }; }
function resize() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); rasterScale = 0; draw();
}
function viewCenter(gst) { return S.cam === 'site' ? S.center : { lat: S.center.lat, lon: norm180(S.starLon - gst / D) }; }

function drawRaster(B, g, sun, lim, rs) {
  const w = Math.ceil(W * rs), h = Math.ceil(H * rs);
  if (!raster || raster.width !== w || raster.height !== h) { raster = new OffscreenCanvas(w, h); rasterCtx = raster.getContext('2d'); }
  const img = rasterCtx.createImageData(w, h), px = img.data, { R, cx, cy } = g, { c, e, n } = B;
  const x0 = Math.max(0, Math.floor((cx - R) * rs)), x1 = Math.min(w, Math.ceil((cx + R) * rs)), y0 = Math.max(0, Math.floor((cy - R) * rs)), y1 = Math.min(h, Math.ceil((cy + R) * rs));
  const lit = S.layers.terminator, polar = S.layers.polar, Rr = R * rs;
  for (let y = y0; y < y1; y++) {
    const v = -((y + 0.5) / rs - cy) / R;
    for (let x = x0; x < x1; x++) {
      const u = ((x + 0.5) / rs - cx) / R, r2 = u * u + v * v;
      if (r2 > 1) continue;
      const wv = Math.sqrt(1 - r2), X = u * e[0] + v * n[0] + wv * c[0], Y = u * e[1] + v * n[1] + wv * c[1], Z = u * e[2] + v * n[2] + wv * c[2];
      const lat = Math.asin(Z) / D, lon = Math.atan2(Y, X) / D;
      const land = mask[Math.min(MH - 1, ((90 - lat) / 180 * MH) | 0) * MW + Math.min(MW - 1, ((lon + 180) / 360 * MW) | 0)] / 255;
      const f = lit ? smooth(-0.31, 0.1, X * sun[0] + Y * sun[1] + Z * sun[2]) : 0.8;
      let r = mix(mix(10, 23, f), mix(38, 112, f), land), gg = mix(mix(10, 21, f), mix(35, 92, f), land), b = mix(mix(12, 17, f), mix(30, 58, f), land);
      if (polar && Math.abs(lat) > lim) { const hatch = ((x + y) % 7) < 1 ? 0.55 : 0.28; r = mix(r, 120, hatch); gg = mix(gg, 38, hatch); b = mix(b, 34, hatch); }
      const limb = 0.62 + 0.38 * wv, a = clamp((1 - Math.sqrt(r2)) * Rr, 0, 1), i = (y * w + x) * 4;
      px[i] = r * limb; px[i + 1] = gg * limb; px[i + 2] = b * limb; px[i + 3] = 255 * a;
    }
  }
  rasterCtx.putImageData(img, 0, 0);
}

function draw() {
  if (!W) return;
  const g = geom(), { R, cx, cy } = g, at = atime(S.t), gst = A.SiderealTime(at) * 15 * D;
  const ctr = viewCenter(gst), B = basis(ctr.lat, ctr.lon), lim = polarLimit(S.t), eps = obliquity(S.t);
  const bodies = bodiesOfDate(S.t).map((b) => ({ ...b, e: toEarth(b.v, gst) })), sun = bodies[0].e;
  const proj = (p) => ({ x: cx + R * dot(p, B.e), y: cy - R * dot(p, B.n), z: dot(p, B.c) });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);

  // the sky behind the Earth: stars and bodies in the far hemisphere, outside the disc
  const Rs = Math.hypot(W, H) * 0.62;
  const top = (document.querySelector('.view-head')?.getBoundingClientRect().height ?? 0) + 40;
  const sky = (p) => { const z = dot(p, B.c); if (z > 0) return null; const x = cx + Rs * dot(p, B.e), y = cy - Rs * dot(p, B.n); return Math.hypot(x - cx, y - cy) < R + 2 || y < top ? null : { x, y }; };
  if (S.layers.stars) {
    const sv = starsOfDate(S.t);
    sv.forEach((v, k) => { const s = STARS[k], q = sky(toEarth(v, gst)); if (!q) return;
      const rr = clamp(1.9 - s.mag * 0.3, 0.35, 2.6); ctx.fillStyle = `rgba(236,227,207,${clamp(1.05 - s.mag * 0.15, 0.18, 1)})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 7); ctx.fill();
      if (s.name) { ctx.font = 'italic 13px Cormorant'; ctx.fillStyle = 'rgba(163,154,134,.75)'; ctx.fillText(s.name, q.x + 6, q.y - 5); } });
  }
  if (S.layers.bodies) bodies.forEach((b) => { const q = sky(b.e); if (!q) return;
    if (b.name === 'Sun') { const gr = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 40); gr.addColorStop(0, 'rgba(244,220,159,.95)'); gr.addColorStop(0.2, 'rgba(244,220,159,.35)'); gr.addColorStop(1, 'rgba(244,220,159,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, q.y, 40, 0, 7); ctx.fill(); }
    ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(q.x, q.y, b.name === 'Sun' ? 6 : b.name === 'Moon' ? 5 : 3, 0, 7); ctx.fill();
    ctx.font = '10px "Plex Mono"'; ctx.fillStyle = b.col; ctx.fillText(b.name.toUpperCase(), q.x + 9, q.y + 4); });

  // the day-lit rim: a thin glow on the side of the limb toward the Sun
  const sdx = dot(sun, B.e), sdy = -dot(sun, B.n), sl = Math.hypot(sdx, sdy) || 1;
  if (S.layers.terminator) { const gr = ctx.createRadialGradient(cx + sdx / sl * R * 0.25, cy + sdy / sl * R * 0.25, R * 0.9, cx, cy, R * 1.12); gr.addColorStop(0, 'rgba(214,178,106,.10)'); gr.addColorStop(1, 'rgba(214,178,106,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.fill(); }

  // the globe
  const rs = S.dragging || S.play ? Math.min(1, dpr) : dpr;
  drawRaster(B, g, sun, lim, rs);
  ctx.drawImage(raster, 0, 0, raster.width / rs, raster.height / rs);

  const line = (pts, style, width, dash = []) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); let on = false;
    for (const p of pts) { const q = proj(p); if (q.z > 0) { on ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); on = true; } else on = false; }
    ctx.stroke(); ctx.setLineDash([]);
  };
  const parallel = (lat) => Array.from({ length: 181 }, (_, k) => vec(lat, -180 + k * 2));
  const meridian = (lon) => Array.from({ length: 91 }, (_, k) => vec(-90 + k * 2, lon));
  if (S.layers.grid) {
    for (let la = -75; la <= 75; la += 15) if (la) line(parallel(la), 'rgba(236,227,207,.07)', 0.8);
    for (let lo = -180; lo < 180; lo += 15) line(meridian(lo), lo === 0 ? 'rgba(236,227,207,.16)' : 'rgba(236,227,207,.07)', 0.8);
    line(parallel(0), 'rgba(236,227,207,.2)', 1);
  }
  if (S.layers.tropics) { line(parallel(eps), 'rgba(143,179,189,.55)', 1, [5, 4]); line(parallel(-eps), 'rgba(143,179,189,.55)', 1, [5, 4]); }
  if (S.layers.polar) { line(parallel(lim), 'rgba(212,106,90,.7)', 1, [2, 3]); line(parallel(-lim), 'rgba(212,106,90,.7)', 1, [2, 3]); }

  // coastlines
  ctx.strokeStyle = 'rgba(214,178,106,.55)'; ctx.lineWidth = 0.7; ctx.beginPath();
  for (const r of COAST) { let on = false;
    for (let k = 0; k < r.v.length; k++) { const p = r.v[k], z = dot(p, B.c);
      if (z <= 0 || r.skip[k]) { on = false; if (z <= 0) continue; }
      const x = cx + R * dot(p, B.e), y = cy - R * dot(p, B.n); on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } }
  ctx.stroke();

  // terminator: the great circle 90° from the subsolar point
  if (S.layers.terminator) {
    const u = Math.abs(sun[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], a = norm3(cross(sun, u)), b = cross(sun, a);
    line(Array.from({ length: 181 }, (_, k) => { const t = k * 2 * D; return [a[0] * Math.cos(t) + b[0] * Math.sin(t), a[1] * Math.cos(t) + b[1] * Math.sin(t), a[2] * Math.cos(t) + b[2] * Math.sin(t)]; }), 'rgba(244,220,159,.45)', 1);
  }
  // labels on the lines, at the left limb
  const edgeLabel = (lat, text, col) => { for (let lo = -180; lo < 180; lo += 1) { /* first visible point from the left */ }
    let best = null; for (let lo = -180; lo < 180; lo += 2) { const q = proj(vec(lat, lo)); if (q.z > 0.4 && (!best || q.x < best.x)) best = q; }
    if (best) { ctx.font = '9.5px "Plex Mono"'; ctx.fillStyle = col; ctx.fillText(text, best.x + 4, best.y - 4); } };
  if (S.layers.tropics) { edgeLabel(eps, `TROPIC ${eps.toFixed(2)}°`, 'rgba(143,179,189,.85)'); edgeLabel(-eps, `TROPIC ${eps.toFixed(2)}°`, 'rgba(143,179,189,.85)'); }
  if (S.layers.polar) { edgeLabel(lim, `POLAR LIMIT ${lim.toFixed(1)}° · THIS ERA`, 'rgba(212,106,90,.95)'); edgeLabel(-lim, `POLAR LIMIT ${lim.toFixed(1)}°`, 'rgba(212,106,90,.95)'); }

  // the Sun and Moon overhead points
  if (S.layers.bodies) for (const b of bodies.slice(0, 2)) { const q = proj(b.e); if (q.z <= 0) continue;
    ctx.strokeStyle = b.col; ctx.fillStyle = b.col; ctx.lineWidth = 1.2;
    if (b.name === 'Sun') { ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 7); ctx.fill(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(q.x + Math.cos(a) * 8, q.y + Math.sin(a) * 8); ctx.lineTo(q.x + Math.cos(a) * 12, q.y + Math.sin(a) * 12); ctx.stroke(); } }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 7); ctx.fill(); }
    ctx.font = '9.5px "Plex Mono"'; const lb = b.name === 'Sun' ? 'SUN OVERHEAD' : 'MOON OVERHEAD', lw = ctx.measureText(lb).width; ctx.fillText(lb, q.x + 15 + lw > W - 8 ? q.x - 15 - lw : q.x + 15, q.y + 16); }

  // the limb
  ctx.strokeStyle = 'rgba(214,178,106,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

  // the observer: a fixed crosshair (Over the site) or a pin riding on the Earth (From the stars)
  const site = proj(vec(S.site.lat, S.site.lon)), mark = S.cam === 'site' ? { x: cx, y: cy, z: 1 } : site;
  if (mark.z > 0) {
    ctx.strokeStyle = '#f4dc9f'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(mark.x, mark.y, 11, 0, 7); ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(mark.x + dx * 15, mark.y + dy * 15); ctx.lineTo(mark.x + dx * 24, mark.y + dy * 24); ctx.stroke(); }
    ctx.fillStyle = '#f4dc9f'; ctx.beginPath(); ctx.arc(mark.x, mark.y, 1.8, 0, 7); ctx.fill();
  }
  const tag = $('tag'); tag.hidden = mark.z <= 0; const tw = tag.offsetWidth || 180; tag.style.left = `${Math.min(mark.x + 30, W - tw - 8)}px`; tag.style.top = `${mark.y + 30}px`;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const m = Math.hypot(...a); return a.map((x) => x / m); };

// ---------- the readouts ----------
function placeLabel() {
  const nb = nearest(S.site), close = nb.km < 25;
  return { nb, close, name: close ? nb.q.name : S.site.name !== 'Custom site' && S.site.source === 'moment' ? S.site.name : `${Math.round(nb.km)} km ${bearingWord(nb.q, S.site)} of ${nb.q.name}`, sub: close ? nb.q.region : '' };
}
const fmtLat = (x) => `${Math.abs(x).toFixed(4)}° ${x >= 0 ? 'N' : 'S'}`, fmtLon = (x) => `${Math.abs(x).toFixed(4)}° ${x >= 0 ? 'E' : 'W'}`;
const hm = (h) => `${Math.floor(h)}h ${p2(Math.round((h % 1) * 60))}m`;
function dayLenH(lat, dec) { const c = (Math.sin(-0.833 * D) - Math.sin(lat * D) * Math.sin(dec * D)) / (Math.cos(lat * D) * Math.cos(dec * D)); return c <= -1 ? 24 : c >= 1 ? 0 : 2 * Math.acos(c) / D / 15; }
function riseAz(lat, dec) { const h = -0.833 * D, c = (Math.sin(dec * D) - Math.sin(lat * D) * Math.sin(h)) / (Math.cos(lat * D) * Math.cos(h)); return Math.acos(clamp(c, -1, 1)) / D; }
const clock = (t) => { if (t == null) return '—'; const l = local(t); return `${p2(l.h)}:${p2(l.mi)}`; };

function renderWhere() {
  const L = placeLabel(), lat = S.site.lat, eps = obliquity(S.t), lim = polarLimit(S.t), al = Math.abs(lat);
  $('pname').textContent = L.name; $('psub').textContent = L.sub;
  $('coords').textContent = `${fmtLat(lat)} · ${fmtLon(S.site.lon)}`;
  const tag = $('tag'); tag.innerHTML = `<b>${L.name}</b><em>${fmtLat(lat)} · ${fmtLon(S.site.lon)}</em>`;
  const calc = $('calc');
  calc.className = 'calc' + (S.calc === 'busy' ? ' busy' : S.calc === 'refused' ? ' refused' : '');
  calc.textContent = S.calc === 'drag' ? 'Let go to calculate here.' : S.calc === 'busy' ? 'Calculating the year here…' : S.calc === 'refused'
    ? `No sunrise on some days of this year here: the calculator refuses latitudes beyond ${lim.toFixed(1)}° in this era.` : 'The year is calculated here.';
  const band = al > lim ? ['Polar · refused in this era', 'warn'] : al > lim - 1.5 ? ['Edge · near the polar limit', 'warn'] : al < eps ? ['Tropic · the Sun passes overhead twice a year', 'silver'] : ['Temperate', ''];
  const north = riseAz(lat, eps), south = riseAz(lat, -eps), o = offsetMin(S.site.tz, S.t);
  const today = local(S.t), mid = fromLocal(today.y, today.mo, today.d, 0, 0), rise = riseSet(+1, mid), set = riseSet(-1, mid);
  const rows = [
    ['Time zone', `${S.site.tz} · UTC${offText(o)}`, ''],
    ['Elevation', `${Math.round(S.site.elev || 0)} m`, ''],
    ['Band', band[0], band[1]],
    ['Portals', al > lim ? '—' : `sunrise ${north.toFixed(1)}° – ${south.toFixed(1)}° · ${(south - north).toFixed(1)}° wide`, 'gold'],
    ['Longest day', al > lim ? '—' : hm(Math.max(dayLenH(lat, eps), dayLenH(lat, -eps))), ''],
    ['Shortest day', al > lim ? '—' : hm(Math.min(dayLenH(lat, eps), dayLenH(lat, -eps))), ''],
    ['This day', `sunrise ${clock(rise)} · sunset ${clock(set)}`, ''],
  ];
  $('where-rows').innerHTML = rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c}">${v}</dd>`).join('');
  const snap = $('snap'); snap.hidden = L.close || L.nb.km > 400; snap.textContent = `Snap to ${L.nb.q.name}`;
  $('site-chip').textContent = `${fmtLat(lat)} ${fmtLon(S.site.lon)} · ${L.close ? L.nb.q.name : 'Custom site'}`;
}

function renderWhen() {
  const l = local(S.t), en = enochOf(S.t), part = partOf(S.t);
  const yEl = $('w-year'), mon = $('w-mon'), day = $('w-day');
  const greg = S.cal === 'greg';
  document.querySelector('.era').style.visibility = greg ? 'visible' : 'hidden';
  if (greg) {
    if (document.activeElement !== yEl) yEl.value = l.y <= 0 ? 1 - l.y : l.y;
    document.querySelectorAll('[data-era]').forEach((b) => b.classList.toggle('on', (b.dataset.era === 'bce') === (l.y <= 0)));
    mon.innerHTML = MONTHS.map((m, k) => `<option value="${k + 1}"${k + 1 === l.mo ? ' selected' : ''}>${m}</option>`).join('');
    day.innerHTML = Array.from({ length: daysIn(l.y, l.mo) }, (_, k) => `<option${k + 1 === l.d ? ' selected' : ''}>${k + 1}</option>`).join('');
  } else {
    if (document.activeElement !== yEl) yEl.value = en.ey;
    mon.innerHTML = ELEN.map((n, k) => `<option value="${k + 1}"${k + 1 === en.mon ? ' selected' : ''}>Month ${k + 1} · ${n} days</option>`).join('');
    day.innerHTML = Array.from({ length: ELEN[en.mon - 1] }, (_, k) => `<option${k + 1 === en.day ? ' selected' : ''}>${k + 1}</option>`).join('');
  }
  renderDay();
  const tEl = $('w-time');
  if (S.tm === 'clock') { tEl.type = 'time'; tEl.removeAttribute('step'); if (document.activeElement !== tEl) tEl.value = `${p2(l.h)}:${p2(l.mi)}`; }
  else { tEl.type = 'number'; tEl.step = '0.01'; tEl.min = '0'; tEl.max = '17.99'; if (document.activeElement !== tEl) tEl.value = part == null ? '' : part.toFixed(2); }
  const y = l.y, sig = dtSigma(y), jd = S.t / 86400000 + 2440587.5;
  const rows = [
    ['Gregorian', `${yearText(y)} · ${MONTHS[l.mo - 1].slice(0, 3)} ${l.d} · ${p2(l.h)}:${p2(l.mi)} (UTC${offText(l.o)})`, 'gold'],
    ['Enoch ≈', `${en.ey} · ${p2(en.mon)} · ${p2(en.day)} · part ${part == null ? '—' : part.toFixed(2)}`, 'gold'],
    ['UT · JD', `${p2(new Date(S.t).getUTCHours())}:${p2(new Date(S.t).getUTCMinutes())} · ${jd.toFixed(4)}`, ''],
    ['Accuracy', sig === 0 ? 'within bounds' : `the Earth's turn uncertain by ±${sig < 3600 ? Math.round(sig / 60) + ' min' : (sig / 3600).toFixed(1) + ' h'} (±${(sig / 240).toFixed(sig < 2400 ? 1 : 0)}°)`, sig > 1800 ? 'warn' : sig ? 'silver' : ''],
  ];
  $('when-rows').innerHTML = rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c}">${v}</dd>`).join('');
  $('t-enoch').innerHTML = `≈ ${en.ey} · ${p2(en.mon)} · ${p2(en.day)}<em>part ${part == null ? '—' : part.toFixed(2)}</em>`;
  $('t-greg').innerHTML = `${yearText(y)}-${p2(l.mo)}-${p2(l.d)} ${p2(l.h)}:${p2(l.mi)}<span class="hide-m"> Gregorian</span>`;
}

/** The Day's bar: daylight gold, night silver, a tick per part (longer every six), risings above, settings below, a playhead. */
function renderDay() {
  const svg = $('daybar'), day = theDay(S.t), w = svg.clientWidth || 380, X = (p) => 4 + (p / 18) * (w - 8), Y = 18, now = clamp(18 * (S.t - day.a) / (day.b - day.a), 0, 18);
  const marks = day.events.filter((e) => e.body !== 'Sun').map((e, k) => e.kind === 'rise'
    ? `<circle class="mk" data-t="${e.t}" cx="${X(e.part)}" cy="${Y - 8}" r="2.6" fill="${e.color}"><title>${evName(e)} ${clock(e.t)}</title></circle>`
    : `<circle class="mk" data-t="${e.t}" cx="${X(e.part)}" cy="${Y + 8}" r="2.3" fill="none" stroke="${e.color}" stroke-width="1"><title>${evName(e)} ${clock(e.t)}</title></circle>`).join('');
  const ticks = Array.from({ length: 19 }, (_, p) => `<line x1="${X(p)}" x2="${X(p)}" y1="${Y - (p % 6 ? 2 : 4)}" y2="${Y + (p % 6 ? 2 : 4)}" stroke="#635d51" stroke-width="0.8"/>`).join('');
  const noon = day.events.find((e) => e.kind === 'noon');
  svg.innerHTML = `<rect x="0" y="0" width="${w}" height="46" fill="transparent"/>
    <line x1="${X(0)}" x2="${X(18)}" y1="${Y}" y2="${Y}" stroke="#4b6268" stroke-width="1.5"/>
    <line x1="${X(0)}" x2="${X(day.dp)}" y1="${Y}" y2="${Y}" stroke="#d6b26a" stroke-width="2.5"/>
    ${ticks}${noon ? `<line x1="${X(noon.part)}" x2="${X(noon.part)}" y1="${Y - 6}" y2="${Y + 6}" stroke="#d6b26a" stroke-width="1"/>` : ''}${marks}
    <text x="${X(0)}" y="${Y + 24}">SUNRISE ${clock(day.a)}</text>
    <text x="${X(day.dp)}" y="${Y + 24}" text-anchor="middle">SUNSET ${clock(day.events.find((e) => e.body === 'Sun' && e.kind === 'set')?.t)}</text>
    <text x="${X(18)}" y="${Y + 24}" text-anchor="end">${clock(day.b)}</text>
    <g transform="translate(${X(now).toFixed(2)} 0)"><line y1="${Y - 11}" y2="${Y + 11}" stroke="${SUN_COLOR}" stroke-width="1.6"/><path d="M-4.5 ${Y - 15}h9l-4.5 4.5z" fill="${SUN_COLOR}"/></g>`;
  // the reading: the clock, the part, and where the moment sits among the day's events
  const prev = [...day.events].reverse().find((e) => e.t <= S.t + 30000), next = day.events.find((e) => e.t > S.t + 30000), mins = (ms) => { const n = Math.round(Math.abs(ms) / 60000); return n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`; };
  const say = (e) => (e.body === 'Sun' ? evName(e).toLowerCase() : evName(e)), where = prev && S.t - prev.t < 90000 ? `at ${say(prev)}` : next ? `${mins(next.t - S.t)} before ${say(next)}` : '';
  $('tod-read').innerHTML = `${clock(S.t)} · part <em>${now.toFixed(2)}</em>${where ? ` · ${where}` : ''}`;
  // the day's events as jumps (as The Day's risings and settings list)
  const main = (e) => e.body === 'Sun' || e.body === 'Moon', shown = S.allEvents ? day.events : day.events.filter(main), more = day.events.length - day.events.filter(main).length;
  $('events').innerHTML = shown.map((e) => `<button type="button" class="ev${Math.abs(e.t - S.t) < 90000 ? ' cur' : e.t < S.t ? ' past' : ''}" data-t="${e.t}" style="--c:${e.color}"><i class="${e.kind === 'set' ? 'set' : ''}"></i>${evName(e)} <b>${clock(e.t)}</b></button>`).join('')
    + (more ? `<button type="button" class="ev more" data-more>${S.allEvents ? 'Sun and Moon only' : `+ ${more} planet risings and settings`}</button>` : '');
}
function scrubTo(ms) { S.t = ms; pause(); renderWhen(); renderWhere(); renderList(); urlSync(); frame(); }
{ const svg = $('daybar'), partAt = (x) => { const r = svg.getBoundingClientRect(); return clamp(((x - r.left - 4) / (r.width - 8)) * 18, 0, 18 - 1e-6); };
  const go = (x) => { const d = theDay(S.t); scrubTo(d.a + partAt(x) / 18 * (d.b - d.a)); };
  svg.addEventListener('pointerdown', (e) => { const mk = e.target.closest?.('.mk'); if (mk) { scrubTo(+mk.dataset.t); return; } svg.setPointerCapture(e.pointerId); S.scrubbing = true; go(e.clientX); });
  svg.addEventListener('pointermove', (e) => { if (svg.hasPointerCapture(e.pointerId)) go(e.clientX); });
  svg.addEventListener('pointerup', () => { S.scrubbing = false; });
  $('events').onclick = (e) => { const b = e.target.closest('.ev'); if (!b) return; if (b.dataset.more != null) { S.allEvents = !S.allEvents; renderDay(); } else scrubTo(+b.dataset.t); };
  new ResizeObserver(() => { if (svg.clientWidth) renderDay(); }).observe(svg); }

// ---------- moments ----------
const COLOURS = ['#d6b26a', '#8fb3bd', '#a8875a', '#a03a30', '#6f9a63', '#ece3cf', '#7a6aa8', '#c9783f'];
const MKEY = 'atlas.mock.moments.v1';
function seedMoments() {
  const qum = PLACES.find((p) => p.name === 'Qumran'), ng = PLACES.find((p) => p.name === 'Newgrange'), sy = PLACES.find((p) => p.name === 'Syene (Aswan)'), ny = PLACES.find((p) => p.name === 'New York');
  const save = S.site; const at = (p, f) => { S.site = p; const t = f(); S.site = save; return t; };
  const riseOn = (p, t) => at(p, () => riseSet(+1, t - 6 * 3600000));
  return [
    { id: 1, name: 'Day 1 at Qumran', desc: 'The first sunrise of the year, where the 364-day texts were kept.', color: COLOURS[0], tags: ['Enoch', 'Day 1'], place: qum, at: riseOn(qum, A.Seasons(2026).mar_equinox.date.getTime()) },
    { id: 2, name: 'Newgrange, midwinter sunrise', desc: 'The light enters the passage.', color: COLOURS[1], tags: ['solstice', 'alignment'], place: ng, at: riseOn(ng, A.Seasons(-3199).dec_solstice.date.getTime()) },
    { id: 3, name: "Eratosthenes' noon", desc: 'Midsummer noon at Syene, 240 BCE.', color: COLOURS[2], tags: ['solstice', 'history'], place: sy, at: A.Seasons(-239).jun_solstice.date.getTime() - (sy.lon / 15) * 3600000 + 12 * 3600000 - ((A.Seasons(-239).jun_solstice.date.getTime() / 3600000 + sy.lon / 15) % 24) * 3600000 },
    { id: 4, name: 'Manhattanhenge', desc: 'Sunset down the cross streets.', color: COLOURS[4], tags: ['alignment', 'city'], place: ny, at: Date.parse('2026-05-29T00:13:00Z') },
    { id: 5, name: 'Jerusalem, every year', desc: 'A place only: keeps the time on show.', color: COLOURS[5], tags: ['Enoch'], place: jer, at: null },
  ];
}
let MOMENTS = JSON.parse(localStorage.getItem(MKEY) ?? 'null') ?? seedMoments();
const saveMoments = () => localStorage.setItem(MKEY, JSON.stringify(MOMENTS));
function momentMeta(m) {
  const parts = [];
  if (m.place) parts.push(m.place.name);
  if (m.at != null) { const save = S.site; if (m.place) S.site = m.place; const l = local(m.at); S.site = save; parts.push(`${yearText(l.y)} ${MONTHS[l.mo - 1].slice(0, 3)} ${l.d} · ${p2(l.h)}:${p2(l.mi)}`); }
  else parts.push('any time');
  return parts.join(' · ');
}
function renderList() {
  const saved = S.list === 'saved', items = saved ? MOMENTS : PLACES.map((p) => ({ name: p.name, desc: p.note, color: null, tags: p.tags, place: p, at: null, region: p.region }));
  const all = [...new Set(items.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b));
  for (const t of [...S.tags]) if (!all.includes(t)) S.tags.delete(t);
  $('tagbar').innerHTML = all.map((t) => `<span class="tag${S.tags.has(t) ? ' on' : ''}" data-tag="${t}">${t}</span>`).join('');
  const q = S.q.toLowerCase();
  const shown = items.filter((m) => [...S.tags].every((t) => m.tags.includes(t)) && (!q || `${m.name} ${m.desc ?? ''} ${m.region ?? ''}`.toLowerCase().includes(q)));
  $('list').innerHTML = shown.map((m) => {
    const k = items.indexOf(m), here = m.place && Math.abs(m.place.lat - S.site.lat) < 1e-4 && Math.abs(m.place.lon - S.site.lon) < 1e-4;
    return `<li data-k="${k}" class="${here ? 'cur' : ''}"><span class="bar" style="background:${m.color ?? 'var(--rule2)'}"></span><div><span class="nm">${m.name}</span>${saved ? '' : `<span class="tg">${m.region}</span>`}</div>
      <div class="mt">${saved ? momentMeta(m) : `${fmtLat(m.place.lat)} · ${fmtLon(m.place.lon)} · ${m.tags.join(' · ')}`}</div>${m.desc ? `<div class="ds">${m.desc}</div>` : ''}</li>`;
  }).join('') || '<li><div></div><div class="ds">Nothing matches.</div></li>';
  $('list').onclick = (e) => { const li = e.target.closest('li[data-k]'); if (!li) return; const m = items[+li.dataset.k]; open(m); };
}
function open(m) {
  if (m.place) { S.site = { ...m.place, source: 'moment' }; flyTo(m.place.lat, m.place.lon); }
  if (m.at != null) S.t = m.at;
  pause(); render();
}

// ---------- interaction ----------
let anim = null;
function flyTo(lat, lon) {
  S.cam = 'site'; syncCam();
  const a = { ...S.center }, dl = norm180(lon - a.lon), t0 = performance.now();
  S.calc = 'busy'; anim = (now) => {
    const f = smooth(0, 1, (now - t0) / 750); S.center = { lat: mix(a.lat, lat, f), lon: norm180(a.lon + dl * f) };
    if (f >= 1) { anim = null; S.center = { lat, lon }; settle(); }
  }; frame();
}
function settle() { S.calc = 'busy'; render(); clearTimeout(settle.t); settle.t = setTimeout(() => { S.calc = Math.abs(S.site.lat) > polarLimit(S.t) ? 'refused' : 'done'; render(); }, 450); }
function render() { renderWhere(); renderWhen(); renderList(); urlSync(); frame(); }
let queued = false; function frame() { if (queued) return; queued = true; requestAnimationFrame(tick); }
let last = performance.now();
function tick(now) {
  queued = false; const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (anim) anim(now);
  if (S.play) { S.t += S.play * S.speed * dt * (S.mode === 'degree' ? 3600000 : 86400000); renderWhen.at = (renderWhen.at ?? 0) + dt; if (renderWhen.at > 0.25) { renderWhen.at = 0; renderWhen(); } }
  draw(); if (anim || S.play) frame();
}
function urlSync() {
  const s = S.site, q = new URLSearchParams({ lat: s.lat.toFixed(4), lon: s.lon.toFixed(4), elev: String(Math.round(s.elev || 0)), tz: s.tz, name: placeLabel().name, at: new Date(S.t).toISOString() });
  history.replaceState(null, '', `?${q}`); return `${location.origin}/?${q}#atlas`;
}

// drag the globe under the crosshair; pinch or wheel to zoom
const pts = new Map(); let pinch0 = 0, zoom0 = 1;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.zoom; return; }
  if (S.cam === 'stars') { const g = A.SiderealTime(atime(S.t)) * 15; S.center = { lat: S.center.lat, lon: norm180(S.starLon - g) }; S.cam = 'site'; syncCam(); flyTo(S.site.lat, S.site.lon); }
  anim = null; S.dragging = true; cv.classList.add('dragging');
});
cv.addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; S.zoom = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0, 1, 14); frame(); return; }
  if (!S.dragging) return;
  const { R } = geom();
  S.center = { lat: clamp(S.center.lat + dy / R / D, -85, 85), lon: norm180(S.center.lon - dx / R / D) };
  const nb = nearest(S.center);
  S.site = { name: 'Custom site', lat: +S.center.lat.toFixed(4), lon: +S.center.lon.toFixed(4), elev: nb.km < 25 ? nb.q.elev : 0, tz: nb.q.tz, source: 'drag' };
  S.calc = 'drag'; renderWhere(); frame();
});
const up = (e) => { pts.delete(e.pointerId); if (S.dragging && pts.size === 0) { S.dragging = false; cv.classList.remove('dragging'); render(); settle(); } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', (e) => { e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0015), 1, 14); frame(); }, { passive: false });
document.querySelectorAll('[data-z]').forEach((b) => b.onclick = () => { S.zoom = clamp(S.zoom * (b.dataset.z === 'in' ? 1.5 : 1 / 1.5), 1, 14); frame(); });

function syncCam() { document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === S.cam)); }
document.querySelectorAll('[data-cam]').forEach((b) => b.onclick = () => {
  if (b.dataset.cam === S.cam) return;
  if (b.dataset.cam === 'stars') { S.starLon = S.center.lon + A.SiderealTime(atime(S.t)) * 15; S.cam = 'stars'; }
  else { S.cam = 'site'; flyTo(S.site.lat, S.site.lon); }
  syncCam(); frame();
});
document.querySelectorAll('[data-layer]').forEach((b) => b.onclick = () => { const k = b.dataset.layer; S.layers[k] = !S.layers[k]; b.classList.toggle('on', S.layers[k]); frame(); });
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; syncTabs(); });
function syncTabs() { document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab)); document.querySelectorAll('[data-sec]').forEach((s) => s.classList.toggle('on', s.dataset.sec === S.tab)); }
$('site-chip').onclick = () => { S.tab = 'where'; syncTabs(); };
$('snap').onclick = () => { const nb = nearest(S.site); S.site = { ...nb.q, source: 'preset' }; flyTo(nb.q.lat, nb.q.lon); render(); };
$('exact').onclick = () => { const f = $('exact-form'); f.hidden = !f.hidden; $('f-lat').value = S.site.lat; $('f-lon').value = S.site.lon; $('f-elev').value = S.site.elev || 0; $('f-tz').value = S.site.tz; };
$('exact-form').onchange = () => { const lat = clamp(+$('f-lat').value, -90, 90), lon = norm180(+$('f-lon').value); S.site = { name: 'Custom site', lat, lon, elev: +$('f-elev').value || 0, tz: $('f-tz').value.trim() || 'UTC', source: 'manual' }; flyTo(lat, lon); render(); };
$('use-here').onclick = () => navigator.geolocation?.getCurrentPosition((p) => { const lat = +p.coords.latitude.toFixed(4), lon = +p.coords.longitude.toFixed(4); S.site = { name: 'Here', lat, lon, elev: Math.round(p.coords.altitude ?? 0), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, source: 'device' }; flyTo(lat, lon); render(); });

// when
document.querySelectorAll('[data-cal]').forEach((b) => b.onclick = () => { if (b.disabled) return; S.cal = b.dataset.cal; document.querySelectorAll('[data-cal]').forEach((x) => x.classList.toggle('on', x === b)); renderWhen(); });
document.querySelectorAll('[data-tm]').forEach((b) => b.onclick = () => { S.tm = b.dataset.tm; document.querySelectorAll('[data-tm]').forEach((x) => x.classList.toggle('on', x === b)); renderWhen(); });
document.querySelectorAll('[data-era]').forEach((b) => b.onclick = () => { const l = local(S.t), n = l.y <= 0 ? 1 - l.y : l.y, y = b.dataset.era === 'bce' ? 1 - n : n; setGreg(y, l.mo, l.d); });
function setGreg(y, mo, d) { const l = local(S.t); y = clamp(y, -12998, 16995); S.t = fromLocal(y, mo, Math.min(d, daysIn(y, mo)), l.h, l.mi); pause(); render(); }
function readFields() {
  const n = Math.max(1, Math.round(+$('w-year').value || 1)), mo = +$('w-mon').value, d = +$('w-day').value;
  if (S.cal === 'greg') { const bce = document.querySelector('[data-era=bce]').classList.contains('on'); setGreg(bce ? 1 - n : n, mo, d); }
  else { const part = partOf(S.t); S.t = enochToT(n, mo, Math.min(d, ELEN[mo - 1]), part); pause(); render(); }
}
$('w-year').onchange = readFields; $('w-mon').onchange = readFields; $('w-day').onchange = readFields;
$('w-time').onchange = () => {
  const v = $('w-time').value;
  if (S.tm === 'clock') { const [h, mi] = v.split(':').map(Number), l = local(S.t); S.t = fromLocal(l.y, l.mo, l.d, h, mi); }
  else { const rise = riseSet(+1, S.t, true); if (rise != null) S.t = rise + clamp(+v, 0, 17.999) * dayLen(rise) / 18; }
  pause(); render();
};
document.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
  const k = +b.dataset.step;
  if (S.cal === 'greg') { const l = local(S.t); setGreg(l.y + k, l.mo, l.d); }
  else { const e = enochOf(S.t); S.t = enochToT(e.ey + k, e.mon, e.day, partOf(S.t)); pause(); render(); }
});
document.querySelectorAll('[data-jump]').forEach((b) => b.onclick = () => {
  const l = local(S.t), mid = fromLocal(l.y, l.mo, l.d, 0, 0), j = b.dataset.jump, se = A.Seasons(l.y), near = (a, c) => (Math.abs(S.t - a) < 86400000 ? c : a);
  if (j === 'now') S.t = Date.now();
  else if (j === 'rise') S.t = riseSet(+1, mid) ?? S.t;
  else if (j === 'set') S.t = riseSet(-1, mid) ?? S.t;
  else if (j === 'noon') { const r = riseSet(+1, mid), s = riseSet(-1, mid); if (r && s) S.t = (r + s) / 2; }
  else if (j === 'eq') S.t = near(se.mar_equinox.date.getTime(), se.sep_equinox.date.getTime());
  else if (j === 'sol') S.t = near(se.jun_solstice.date.getTime(), se.dec_solstice.date.getTime());
  else if (j === 'day1') { const e = enochOf(S.t); S.t = enochToT(e.ey, 1, 1, 0); }
  pause(); render();
});

// moments
document.querySelectorAll('[data-list]').forEach((b) => b.onclick = () => { S.list = b.dataset.list; S.tags.clear(); document.querySelectorAll('[data-list]').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });
$('tagbar').onclick = (e) => { const t = e.target.dataset?.tag; if (!t) return; S.tags.has(t) ? S.tags.delete(t) : S.tags.add(t); renderList(); };
$('search').oninput = (e) => { S.q = e.target.value; renderList(); };
let edColour = COLOURS[0];
$('save').onclick = () => {
  const L = placeLabel(), l = local(S.t);
  $('ed-name').value = `${L.close ? L.nb.q.name : L.name} · ${yearText(l.y)} ${MONTHS[l.mo - 1].slice(0, 3)} ${l.d}`;
  $('ed-desc').value = ''; $('ed-tags').value = '';
  $('ed-sum').textContent = `${fmtLat(S.site.lat)} · ${fmtLon(S.site.lon)} — ${$('t-greg').textContent} — Enoch ${$('t-enoch').textContent.replace(/part.*/, '')}`;
  $('ed-col').innerHTML = COLOURS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === edColour ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('');
  $('ed-sugg').innerHTML = [...new Set(MOMENTS.flatMap((m) => m.tags))].map((t) => `<span class="tag" data-tag="${t}">${t}</span>`).join('');
  $('ed-link').textContent = urlSync();
  $('editor').showModal();
};
$('ed-col').onclick = (e) => { const c = e.target.dataset?.c; if (!c) return; edColour = c; $('ed-col').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === c)); };
$('ed-sugg').onclick = (e) => { const t = e.target.dataset?.tag; if (!t) return; const cur = $('ed-tags').value.split(',').map((x) => x.trim()).filter(Boolean); if (!cur.includes(t)) $('ed-tags').value = [...cur, t].join(', '); };
$('editor').onclose = () => {
  if ($('editor').returnValue !== 'save') return;
  MOMENTS.unshift({ id: Date.now(), name: $('ed-name').value.trim() || 'Moment', desc: $('ed-desc').value.trim(), color: edColour, tags: $('ed-tags').value.split(',').map((x) => x.trim()).filter(Boolean), place: { ...S.site, name: placeLabel().name }, at: S.t });
  saveMoments(); S.list = 'saved'; document.querySelectorAll('[data-list]').forEach((x) => x.classList.toggle('on', x.dataset.list === 'saved')); S.tab = 'moments'; syncTabs(); renderList();
};

// playback: Degree runs the clock (an hour a second at 1×), Day glides the date (a day a second)
const SPEEDS = [0.5, 1, 2, 4, 16];
function pause() { S.play = 0; $('play').textContent = '▶'; }
document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { S.mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b)); });
document.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => {
  const k = b.dataset.play;
  if (k === 'ff' || k === 'ff-back') { S.t += (k === 'ff' ? 1 : -1) * 86400000; pause(); render(); return; }
  const dir = k === 'fwd' ? 1 : -1; S.play = S.play === dir ? 0 : dir; $('play').textContent = S.play === 1 ? '❚❚' : '▶';
  if (!S.play) render(); frame();
});
$('speed').onclick = () => { S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]; $('speed').textContent = `${S.speed}×`; };
$('now').onclick = () => { S.t = Date.now(); pause(); render(); };

// the tab bar on a phone: the current tab in view, a fade where more tabs wait
{ const nav = document.querySelector('.nav'), on = nav.querySelector('a.on');
  const arrow = (dir) => { const b = document.createElement('button'); b.className = `nav-more nav-more-${dir}`; b.textContent = dir === 'l' ? '‹' : '›'; b.setAttribute('aria-label', dir === 'l' ? 'Earlier tabs' : 'More tabs');
    b.onclick = () => nav.scrollBy({ left: (dir === 'l' ? -1 : 1) * nav.clientWidth * 0.8, behavior: 'smooth' }); return b; };
  const L = arrow('l'), Rt = arrow('r'); nav.before(L); nav.after(Rt);
  const edges = () => { const l = nav.scrollLeft > 2, r = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2;
    nav.classList.toggle('more-l', l); nav.classList.toggle('more-r', r); L.hidden = !l; Rt.hidden = !r; };
  nav.addEventListener('scroll', edges, { passive: true }); new ResizeObserver(() => { on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); edges(); }).observe(nav); }
// start
new ResizeObserver(resize).observe(cv);
syncTabs(); syncCam(); await document.fonts.ready; resize(); render(); settle();
window.__atlas = { S, render, open, MOMENTS };
