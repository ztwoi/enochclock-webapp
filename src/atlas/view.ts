// Atlas: the shared instant seen from outside the Earth (docs/atlas.md). A globe in Earth-fixed axes (geo.ts) lit by the
// Sun of the instant, today's coastlines (land.ts), the tropics and the polar limit of the era, and behind it the stars and
// the bodies, turned to the Earth by the sidereal angle. Two cameras: over the site (the camera turns with the Earth, the site
// under the crosshair) and from the stars (the Earth turns under a fixed sky, the site's pin rides on it).
// WebGL draws the globe, its lines and the stars; an SVG overlay in the host's CSS pixels carries the marks and words.
import * as THREE from 'three';
import { AstroTime, Body, GeoVector, Rotation_EQJ_EQD, SiderealTime } from 'astronomy-engine';
import type { Catalogue } from '../skyview';
import { PCOL } from '../dial/state';
import { band, bearingWord, dot, eqjToEarth, frameAt, latLon, nearest, norm180, obliquity, polarLimit, preview, vec, type V3 } from './geo';
import { coastSegments, landMask, loadLand } from './land';
import { places } from './places';
import './atlas.css';

export type Camera = 'site' | 'stars';
export interface Layers { daynight: boolean; tropics: boolean; polar: boolean; bodies: boolean; stars: boolean; grid: boolean }
export const LAYERS: Layers = { daynight: true, tropics: true, polar: true, bodies: true, stars: true, grid: true };
export interface AtlasSite { lat: number; lon: number; name: string }
export interface AtlasOptions {
  /** Pixels at the top of the host held by the view's title and options (the globe is centred below them). */
  headClearance: () => number;
  /** A hand let go of the globe: the site under the crosshair is chosen (the app calculates the year there). */
  onPick: (lat: number, lon: number) => void;
  /** The view changed its own camera (a drag over the stars turns it back over the site). */
  onCamera?: (c: Camera) => void;
}
export interface Atlas {
  /** Draw the instant (Julian day, UT) over the site. */
  draw(jd: number, site: AtlasSite): void;
  setCamera(c: Camera): void;
  readonly camera: Camera;
  setLayers(l: Partial<Layers>): void;
  zoomStep(f: number): void;
  home(): void;
  /** The site chosen cannot be calculated: the globe goes back to the site on show, and says why. */
  refuse(why: string): void;
  /** What the view shows, for the details and the tests. */
  info(): AtlasInfo | null;
  dispose(): void;
}
export interface AtlasInfo {
  jd: number; gast: number; obliquity: number; polarLimit: number; zoom: number; camera: Camera;
  centre: { lat: number; lon: number }; sun: { lat: number; lon: number }; moon: { lat: number; lon: number };
  /** Where the site is drawn, in the host's CSS pixels (null: on the far side). */
  sitePx: { x: number; y: number } | null;
}

const J2000 = 2451545, STAR_R = 5000, DIST = 8, FILL = 0.86, MAX_ZOOM = 14, MAG_LIMIT = 5.5, D = Math.PI / 180;
const SUN = '#f4dc9f', MOON = '#d8d2c4';
const BODIES: [Body, string, string][] = [[Body.Sun, 'Sun', SUN], [Body.Moon, 'Moon', MOON],
  ...(['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const).map((n): [Body, string, string] => [Body[n], n, PCOL[n]])];

const globeShader = (land: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { land: { value: land }, sun: { value: new THREE.Vector3(1, 0, 0) }, lit: { value: 1 }, polarOn: { value: 1 }, polarLim: { value: 66 * D }, px: { value: 1 } },
  vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D land; uniform vec3 sun; uniform float lit, polarOn, polarLim, px; varying vec3 vPos;
    const float PI = 3.141592653589793;
    void main(){
      vec3 n = normalize(vPos);
      float lat = asin(clamp(n.z, -1., 1.)), lon = atan(n.y, n.x);
      float L = texture2D(land, vec2((lon + PI) / (2. * PI), (lat + .5 * PI) / PI)).a;
      float sd = dot(n, sun), f = lit > .5 ? smoothstep(-.31, .1, sd) : .8;           // night → astronomical twilight → day
      vec3 col = mix(mix(vec3(10., 10., 12.), vec3(23., 21., 17.), f), mix(vec3(38., 35., 30.), vec3(112., 92., 58.), f), L) / 255.;
      if (polarOn > .5 && abs(lat) > polarLim) {                                      // refused by the calculator in this era: hatched
        float h = mod(gl_FragCoord.x + gl_FragCoord.y, 7. * px) < px ? .55 : .28;
        col = mix(col, vec3(120., 38., 34.) / 255., h);
      }
      if (lit > .5) col = mix(col, vec3(244., 220., 159.) / 255., (1. - smoothstep(0., fwidth(sd) * 1.4, abs(sd))) * .5);   // the terminator
      float limb = .62 + .38 * max(dot(n, normalize(cameraPosition - vPos)), 0.);
      gl_FragColor = vec4(col * limb, 1.);
    }`,
});

/** A circle of latitude on the sphere, as a closed line. */
const parallel = (lat: number, r = 1.0008) => { const p: number[] = []; for (let k = 0; k <= 360; k += 2) { const v = vec(lat, k - 180); p.push(v[0] * r, v[1] * r, v[2] * r); } return p; };
const meridian = (lon: number, r = 1.0008) => { const p: number[] = []; for (let k = -90; k <= 90; k += 2) { const v = vec(k, lon); p.push(v[0] * r, v[1] * r, v[2] * r); } return p; };
function lineOf(pts: number[], mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.Line(g, mat); if (mat instanceof THREE.LineDashedMaterial) l.computeLineDistances(); return l;
}
/** J2000 → Earth-fixed (geo.ts) as a THREE matrix. */
function earthMatrix(rot: number[][], gastDeg: number) {
  const m = eqjToEarth(rot, gastDeg);
  return new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
}

export function createAtlas(host: HTMLElement, catalogue: () => Catalogue | null, opts: AtlasOptions): Atlas {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'gl';
  host.append(renderer.domElement);
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'overlay atlas-overlay'); overlay.setAttribute('aria-hidden', 'true');
  host.append(overlay);
  const tag = document.createElement('div'); tag.className = 'atlas-tag'; host.append(tag);
  const note = document.createElement('p'); note.className = 'atlas-note'; note.setAttribute('role', 'status'); note.hidden = true; host.append(note);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(20, 1, 0.01, STAR_R * 2);
  const maskTex = new THREE.Texture(); maskTex.minFilter = THREE.LinearFilter; maskTex.generateMipmaps = false;   // no mipmaps: the longitude wraps per fragment
  const globeMat = globeShader(maskTex), globeGeo = new THREE.SphereGeometry(1, 192, 96).rotateX(Math.PI / 2);   // the sphere's poles on z
  scene.add(new THREE.Mesh(globeGeo, globeMat));

  const coastMat = new THREE.LineBasicMaterial({ color: '#d6b26a', transparent: true, opacity: 0.55 });
  const coast = new THREE.LineSegments(new THREE.BufferGeometry(), coastMat); scene.add(coast);
  const gridMat = new THREE.LineBasicMaterial({ color: '#ece3cf', transparent: true, opacity: 0.07 });
  const grid = new THREE.Group();
  for (let la = -75; la <= 75; la += 15) if (la) grid.add(lineOf(parallel(la), gridMat));
  for (let lo = -180; lo < 180; lo += 15) grid.add(lineOf(meridian(lo), lo === 0 ? new THREE.LineBasicMaterial({ color: '#ece3cf', transparent: true, opacity: 0.16 }) : gridMat));
  grid.add(lineOf(parallel(0), new THREE.LineBasicMaterial({ color: '#ece3cf', transparent: true, opacity: 0.2 })));
  scene.add(grid);
  const tropicMat = new THREE.LineDashedMaterial({ color: '#8fb3bd', transparent: true, opacity: 0.6, dashSize: 0.03, gapSize: 0.022 });
  const polarMat = new THREE.LineDashedMaterial({ color: '#d46a5a', transparent: true, opacity: 0.75, dashSize: 0.012, gapSize: 0.016 });
  const circles = new THREE.Group(); scene.add(circles);
  let circlesAt = { eps: NaN, lim: NaN };
  function setCircles(eps: number, lim: number) {
    if (Math.abs(eps - circlesAt.eps) < 1e-3 && Math.abs(lim - circlesAt.lim) < 1e-3) return;
    circles.traverse((o) => (o as THREE.Line).geometry?.dispose()); circles.clear();   // the tropics' and polar limit's groups, and their lines
    const t = new THREE.Group(); t.name = 'tropics'; t.add(lineOf(parallel(eps), tropicMat), lineOf(parallel(-eps), tropicMat));
    const p = new THREE.Group(); p.name = 'polar'; p.add(lineOf(parallel(lim), polarMat), lineOf(parallel(-lim), polarMat));
    circles.add(t, p); circlesAt = { eps, lim }; applyLayers();
  }

  // the stars: catalogue directions (J2000, moved by their proper motion to the era) on a far sphere, turned with the sky
  const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { px: { value: 1 } },
    vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float px;
      void main(){ vA = alpha; gl_PointSize = size * px; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - .5); if (r > .5) discard; gl_FragColor = vec4(.925, .89, .81, vA * smoothstep(.5, .2, r)); }`,
  }));
  stars.matrixAutoUpdate = false; scene.add(stars);
  let starsYear = NaN, starsFrom: Catalogue | null = null; const named: { name: string; v: V3 }[] = [];
  function setStars(jd: number) {
    const year = 2000 + (jd - J2000) / 365.25;
    const cat = catalogue();
    if (!cat || (cat === starsFrom && Math.abs(year - starsYear) < 25)) return;   // the proper motions moved on again every 25 years
    starsYear = year; starsFrom = cat; named.length = 0;
    const dt = year - 2000, MAS = D / 3600000, pos: number[] = [], size: number[] = [], alpha: number[] = [];
    for (const s of cat.stars) {
      if (s.mag_v > MAG_LIMIT) continue;
      const dec = s.dec_deg * D + s.pm_dec_mas_per_year * MAS * dt, cd = Math.cos(dec);
      const ra = s.ra_deg * D + (cd > 1e-6 ? (s.pm_ra_cosdec_mas_per_year * MAS * dt) / cd : 0);
      const v: V3 = [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)];
      pos.push(v[0] * STAR_R, v[1] * STAR_R, v[2] * STAR_R);
      size.push(Math.max(1.2, 4.6 - s.mag_v * 0.62)); alpha.push(Math.min(1, Math.max(0.2, 1.05 - s.mag_v * 0.14)));
      if (s.name && s.mag_v < 1.4) named.push({ name: s.name, v });
    }
    const g = stars.geometry; g.dispose();
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ng.setAttribute('size', new THREE.Float32BufferAttribute(size, 1)); ng.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
    stars.geometry = ng;
  }

  let layers: Layers = { ...LAYERS }, cam: Camera = 'site', zoom = 1, starLon = 0, w = 0, h = 0, disposed = false;
  let last: { jd: number; site: AtlasSite } | null = null, shownInfo: AtlasInfo | null = null, rpxNow = 1;
  /** The site under the crosshair while a hand turns the globe, and after it lets go until the app's year is there. */
  let drag: { lat: number; lon: number } | null = null, pending: { lat: number; lon: number } | null = null;
  function applyLayers() {
    globeMat.uniforms.lit.value = layers.daynight ? 1 : 0; globeMat.uniforms.polarOn.value = layers.polar ? 1 : 0;
    grid.visible = layers.grid; stars.visible = layers.stars;
    const t = circles.getObjectByName('tropics'), p = circles.getObjectByName('polar');
    if (t) t.visible = layers.tropics; if (p) p.visible = layers.polar;
  }

  loadLand().then((rings) => {
    if (disposed) return;
    maskTex.image = landMask(rings); maskTex.needsUpdate = true;
    coast.geometry.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(coastSegments(rings), 3)); coast.geometry = g;
    redraw();
  }).catch(() => { host.dataset.landError = '1'; });

  function resize() {
    const r = host.getBoundingClientRect(); w = r.width; h = r.height;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio(); globeMat.uniforms.px.value = pr; (stars.material as THREE.ShaderMaterial).uniforms.px.value = pr;
  }
  const ro = new ResizeObserver(() => { resize(); redraw(); }); ro.observe(host);
  const redraw = () => { if (last) draw(last.jd, last.site); };

  /** The camera over (lat, lon), sized so the globe fills the space under the title block, at the zoom. */
  function aim(lat: number, lon: number) {
    const head = Math.min(opts.headClearance(), h * 0.4), avail = h - head, f = frameAt(lat, lon);
    camera.position.set(f.c[0] * DIST, f.c[1] * DIST, f.c[2] * DIST); camera.up.set(f.n[0], f.n[1], f.n[2]); camera.lookAt(0, 0, 0);
    const rpx = (FILL * Math.min(w, avail) / 2) * zoom, tanA = 1 / Math.sqrt(DIST * DIST - 1); rpxNow = rpx;
    camera.fov = 2 * Math.atan(((h / 2) / rpx) * tanA) / D; camera.aspect = w / h;
    camera.setViewOffset(w, h, 0, -head / 2, w, h);                 // the globe's centre in the middle of the space under the title
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  const project = (p: THREE.Vector3) => { const q = p.clone().project(camera); return { x: (q.x + 1) / 2 * w, y: (1 - q.y) / 2 * h }; };
  /** A point on the globe faces the camera. */
  const facing = (v: V3) => v[0] * (camera.position.x - v[0]) + v[1] * (camera.position.y - v[1]) + v[2] * (camera.position.z - v[2]) > 0;
  /** A direction far away is hidden behind the globe (the line of sight from the camera meets the sphere). */
  const behind = (d: THREE.Vector3) => { const c = camera.position, b = c.dot(d); return b < 0 && b * b - (c.lengthSq() - 1) > 0; };

  function draw(jd: number, calc: AtlasSite) {
    last = { jd, site: calc };
    if (pending && Math.abs(pending.lat - calc.lat) < 1e-6 && Math.abs(norm180(pending.lon - calc.lon)) < 1e-6) pending = null;   // the year is there
    const choosing = drag ?? pending, site: AtlasSite = choosing ? { ...choosing, name: '' } : calc;
    if (!w) resize(); if (!w || !h) return;
    const time = new AstroTime(jd - J2000), gast = SiderealTime(time) * 15, rot = Rotation_EQJ_EQD(time).rot;
    const toE = earthMatrix(rot, gast), eps = obliquity(jd), lim = polarLimit(jd);
    setCircles(eps, lim); setStars(jd);
    stars.matrix.copy(toE); stars.matrixWorldNeedsUpdate = true;
    const dirs = BODIES.map(([body, name, color]) => { const g = GeoVector(body, time, true), v = new THREE.Vector3(g.x, g.y, g.z).applyMatrix4(toE).normalize(); return { name, color, v }; });
    const sun = dirs[0].v; globeMat.uniforms.sun.value.copy(sun); globeMat.uniforms.polarLim.value = lim * D;
    const centre = cam === 'site' ? { lat: site.lat, lon: site.lon } : { lat: site.lat, lon: norm180(starLon - gast) };
    aim(centre.lat, centre.lon);
    renderer.render(scene, camera);

    // the overlay: marks always; words placed by rank (the site's tag, the overhead points, the circles, the bodies, the stars),
    // a word that would cover one already placed left out
    const s: string[] = [], ff = (n: number) => n.toFixed(1), boxes: [number, number, number, number][] = [];
    const word = (x: number, y: number, text: string, cls: string, cw: number, anchor: 'start' | 'end' = 'start', fill = '') => {
      const wd = text.length * cw, x0 = anchor === 'end' ? x - wd : x, box: [number, number, number, number] = [x0 - 2, y - 11, x0 + wd + 2, y + 3];
      if (boxes.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) return;
      boxes.push(box); s.push(`<text class="${cls}" x="${ff(x)}" y="${ff(y)}"${anchor === 'end' ? ' text-anchor="end"' : ''}${fill ? ` fill="${fill}"` : ''}>${text}</text>`);
    };
    const sv = vec(site.lat, site.lon), sp = facing(sv) ? project(new THREE.Vector3(...sv)) : null;
    if (sp) {                                                                  // the crosshair (over the site) or the pin (from the stars), and its tag's room
      s.push(`<g class="at-cross${cam === 'stars' ? ' pin' : ''}" transform="translate(${ff(sp.x)} ${ff(sp.y)})"><circle r="11"/><path d="M15 0H24M-15 0H-24M0 15V24M0 -15V-24"/><circle r="1.8" class="dot"/></g>`);
      boxes.push([sp.x - 26, sp.y - 26, sp.x + 26, sp.y + 26], [Math.min(sp.x + 30, w - 188), sp.y + 30, Math.min(sp.x + 30, w - 188) + 180, sp.y + 76]);
    }
    if (layers.bodies) for (const b of dirs.slice(0, 2)) {                     // overhead points on the globe
      const v: V3 = [b.v.x * 1.001, b.v.y * 1.001, b.v.z * 1.001]; if (!facing(v)) continue;
      const p = project(new THREE.Vector3(...v)), label = b.name === 'Sun' ? 'SUN OVERHEAD' : 'MOON OVERHEAD', col = b.name === 'Sun' ? SUN : MOON;
      s.push(b.name === 'Sun'
        ? `<circle cx="${ff(p.x)}" cy="${ff(p.y)}" r="5" fill="${SUN}"/>` + Array.from({ length: 8 }, (_, k) => { const a = k * Math.PI / 4; return `<line x1="${ff(p.x + Math.cos(a) * 8)}" y1="${ff(p.y + Math.sin(a) * 8)}" x2="${ff(p.x + Math.cos(a) * 12)}" y2="${ff(p.y + Math.sin(a) * 12)}" stroke="${SUN}" stroke-width="1.2"/>`; }).join('')
        : `<circle cx="${ff(p.x)}" cy="${ff(p.y)}" r="6" fill="none" stroke="${MOON}" stroke-width="1.2"/><circle cx="${ff(p.x)}" cy="${ff(p.y)}" r="2" fill="${MOON}"/>`);
      boxes.push([p.x - 13, p.y - 13, p.x + 13, p.y + 13]);
      const right = p.x + 15 + label.length * 5.8 < w - 8;
      word(right ? p.x + 15 : p.x - 15, p.y + 16, label, 'at-mark', 5.8, right ? 'start' : 'end', col);
    }
    const edge = (lat: number, text: string, cls: string) => {                 // a circle's name at its leftmost point well in view
      let best: { x: number; y: number } | null = null;
      for (let lo = -180; lo < 180; lo += 2) { const v = vec(lat, lo); if (dot(v, [camera.position.x / DIST, camera.position.y / DIST, camera.position.z / DIST]) < 0.4) continue; const p = project(new THREE.Vector3(...v)); if (!best || p.x < best.x) best = p; }
      if (best) word(best.x + 4, best.y - 4, text, cls, 5.8);
    };
    if (layers.polar) { edge(lim, `POLAR LIMIT ${lim.toFixed(1)}° · THIS ERA`, 'at-polar'); edge(-lim, `POLAR LIMIT ${lim.toFixed(1)}°`, 'at-polar'); }
    if (layers.tropics) { edge(eps, `TROPIC ${eps.toFixed(2)}°`, 'at-tropic'); edge(-eps, `TROPIC ${eps.toFixed(2)}°`, 'at-tropic'); }
    if (layers.bodies) for (const b of dirs) {
      if (behind(b.v)) continue;
      const p = project(b.v.clone().multiplyScalar(STAR_R)); if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      if (b.name === 'Sun') s.push(`<circle cx="${ff(p.x)}" cy="${ff(p.y)}" r="40" fill="url(#at-glow)"/>`);
      s.push(`<circle cx="${ff(p.x)}" cy="${ff(p.y)}" r="${b.name === 'Sun' ? 6 : b.name === 'Moon' ? 5 : 3}" fill="${b.color}"/>`);
      word(p.x + 9, p.y + 4, b.name.toUpperCase(), 'at-body', 6.1, 'start', b.color);
    }
    if (layers.stars) for (const st of named) {
      const d = new THREE.Vector3(...st.v).applyMatrix4(toE); if (behind(d)) continue;
      const p = project(d.clone().multiplyScalar(STAR_R)); if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
      word(p.x + 6, p.y - 5, st.name, 'at-star', 6);
    }
    overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    overlay.innerHTML = `<defs><radialGradient id="at-glow"><stop offset="0" stop-color="${SUN}" stop-opacity=".95"/><stop offset=".2" stop-color="${SUN}" stop-opacity=".35"/><stop offset="1" stop-color="${SUN}" stop-opacity="0"/></radialGradient></defs>${s.join('')}`;
    tag.hidden = !sp;
    if (sp) {
      const nb = nearest(site, places), here = nb && nb.km < 2 ? nb.place.name : choosing && nb ? `${Math.round(nb.km)} km ${bearingWord(nb.place, site)} of ${nb.place.name}` : site.name;
      let html = `<b>${here}</b><em>${Math.abs(site.lat).toFixed(4)}° ${site.lat >= 0 ? 'N' : 'S'} · ${Math.abs(site.lon).toFixed(4)}° ${site.lon >= 0 ? 'E' : 'W'}</em>`;
      if (choosing) {                                                          // what a year here would show, before it is calculated
        const pv = preview(site.lat, jd), hm = (x: number) => `${Math.floor(x)} h ${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
        html += pv.band === 'polar' ? `<span class="warn">Beyond the polar limit of this era: the calculator refuses a year here</span>`
          : `<span>${pv.band === 'tropic' ? 'Tropic' : pv.band === 'edge' ? 'Near the polar limit' : 'Temperate'} · portals ${pv.north.toFixed(0)}°–${pv.south.toFixed(0)}° · days ${hm(pv.shortest)} to ${hm(pv.longest)}</span>`
          + `<span class="state">${drag ? 'Let go to calculate here' : 'Calculating the year here…'}</span>`;
      }
      if (tag.dataset.h !== html) { tag.innerHTML = html; tag.dataset.h = html; }
      tag.style.left = `${Math.min(sp.x + 30, w - (tag.offsetWidth || 180) - 8)}px`; tag.style.top = `${sp.y + 30}px`;
    }
    shownInfo = { jd, gast, obliquity: eps, polarLimit: lim, zoom, camera: cam, centre, sun: latLon([sun.x, sun.y, sun.z]), moon: latLon([dirs[1].v.x, dirs[1].v.y, dirs[1].v.z]), sitePx: sp };
    host.dataset.band = band(site.lat, jd); host.classList.toggle('choosing', !!choosing);
  }

  // zoom: the wheel, a pinch, + and − (keys, in main.ts); a double tap goes home
  const setZoom = (z: number) => { zoom = Math.max(1, Math.min(MAX_ZOOM, z)); redraw(); };
  host.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const pts = new Map<number, { x: number; y: number }>(); let pinch0 = 0, zoom0 = 1;
  host.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; }
  });
  host.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; setZoom(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0); }
  });
  // a hand turns the globe under the crosshair: up and down the latitude, sideways the longitude; letting go chooses the site
  let down: { x: number; y: number } | null = null, queued = false;
  const frame = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; redraw(); }); };
  host.addEventListener('pointerdown', (e) => { if (e.button === 0 && pts.size === 1) { down = { x: e.clientX, y: e.clientY }; host.setPointerCapture(e.pointerId); } });
  host.addEventListener('pointermove', (e) => {
    if (!down || pts.size !== 1 || !last) return;
    if (!drag) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;   // a tap or a double click is not a drag
      const from = pending ?? last.site;
      if (cam === 'stars') { cam = 'site'; opts.onCamera?.('site'); }        // turning the globe is done over the site
      drag = { lat: from.lat, lon: from.lon }; pending = null; note.hidden = true; host.classList.add('dragging');
    }
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = { x: e.clientX, y: e.clientY };
    drag = { lat: Math.max(-85, Math.min(85, drag.lat + dy / rpxNow / D)), lon: norm180(drag.lon - dx / (rpxNow * Math.max(0.2, Math.cos(drag.lat * D))) / D) };
    frame();
  });
  const release = () => {
    down = null; host.classList.remove('dragging');
    if (!drag || !last) return;
    const at = { lat: +drag.lat.toFixed(4), lon: +drag.lon.toFixed(4) }; drag = null;
    if (Math.abs(at.lat) > polarLimit(last.jd) - 0.05) { say(`No year at ${Math.abs(at.lat).toFixed(1)}° ${at.lat >= 0 ? 'N' : 'S'} in this era: beyond the polar limit (${polarLimit(last.jd).toFixed(1)}°) some day has no sunrise.`); redraw(); return; }
    pending = at; redraw(); opts.onPick(at.lat, at.lon);
  };
  let noteTimer = 0;
  const say = (why: string) => { note.textContent = why; note.hidden = false; clearTimeout(noteTimer); noteTimer = window.setTimeout(() => { note.hidden = true; }, 7000); };
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; if (pts.size === 0) release(); else down = null; };
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  host.addEventListener('dblclick', () => setZoom(1));

  return {
    draw,
    setCamera(c) {
      if (c === cam) return;
      if (c === 'stars' && last) starLon = (pending ?? last.site).lon + SiderealTime(new AstroTime(last.jd - J2000)) * 15;   // the sky holds where it stands now
      cam = c; redraw();
    },
    get camera() { return cam; },
    setLayers(l) { layers = { ...layers, ...l }; applyLayers(); redraw(); },
    zoomStep(f) { setZoom(zoom * f); },
    home() { setZoom(1); },
    refuse(why) { pending = null; say(why); redraw(); },
    info: () => shownInfo,
    dispose() {
      disposed = true; ro.disconnect();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); });
      maskTex.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); overlay.remove(); tag.remove();
    },
  };
}
