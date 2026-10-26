// The machine seen from above: the earth as a globe at the centre, the road of the luminaries
// spreading from it like a ring (the plane of the observer's horizon), twelve portals on its rim, and the Sun's daily
// circle around it, tilted as the real Sun's is at the film's latitude. Where the circle cuts the rim is the sunrise
// (or sunset) bearing; the share of the circle above the road is the share of the day in light; at night the Sun
// passes under the north (72:5). The circle is fitted to each morning's computed sunrise bearing, so its crossings fall
// exactly on the calculator's sunrises; the globe's light, the glow and the scale are presentation.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { dir, glowTexture, type StarIn } from './world';

const smoothstep01 = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const RIM = 100, GLOBE = 9;
/** The Dial's face under the machine: its horizon circle (viewBox radius 376) lies on the rim, its sky band (to 498) beyond. */
const DISC = RIM * 498 / 376;
const D = Math.PI / 180;

/** The Sun's daily circle at latitude `lat` (°) for declination `dec` (°): the position at hour angle H (rad; 0 = due
 *  south, at the top of its arc; negative = morning), on a sphere of radius r. x = east, y = up, z = south (−north). */
export function onCircle(lat: number, dec: number, H: number, r = RIM) {
  const f = lat * D, d = dec * D;
  const north = Math.cos(f) * Math.sin(d) - Math.sin(f) * Math.cos(d) * Math.cos(H);
  const east = -Math.cos(d) * Math.sin(H), up = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H);
  return new THREE.Vector3(east * r, up * r, -north * r);
}
/** The declination whose circle cuts the horizon at this sunrise bearing (flat horizon), so the crossing is the computed sunrise. */
export const decForSunrise = (lat: number, az: number) => Math.asin(Math.cos(az * D) * Math.cos(lat * D)) / D;
/** Hour angle of sunrise (rad, negative) for that circle. */
export const sunriseH = (lat: number, dec: number) => -Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat * D) * Math.tan(dec * D))));

export interface Gate { az0: number; az1: number; portal: number; rise: number; glow?: number; cool?: number }
export interface StarM extends StarIn { lead: boolean; name?: string | null }
export interface MState {
  camera: { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; fov: number };
  stars: StarM[];
  lat: number;
  /** The Moon (bearing/altitude) and the Sun's direction for its phase; null when not shown. */
  moon: { az: number; alt: number; on: number; fraction: number; pathReveal?: number } | null;   // pathReveal: <0 its path not yet drawn, 0 drawn as far as the Moon has come from its rising, 0…1 closing into the whole circle, ≥1 or unset the whole circle
  /** Today's circle (declination), how much of it is drawn (0…1 from sunrise), and the Sun's hour angle on it. */
  dec: number; draw: number; sunH: number; sunOn: number;
  /** Earlier days' circles, faint. */
  ghosts: { dec: number; o: number }[];
  /** Ticks dividing today's circle into 18 parts (0…1 visible). */
  parts: number;
  gates: Gate[];
  /** Sunrises (east) and sunsets (west) so far, as embers on the rim. */
  day: number;
  reveal: number;   // the whole machine fading up out of the dark
  /** The paths of the Sun and the Moon: 1 full brightness (they are the subject), less to recede behind the Dial. */
  pathGlow?: number;
  /** The Moon's path alone (defaults to pathGlow). */
  moonGlow?: number;
  /** The Dial floor's own brightness (0 hides a change of day between scenes). */
  floorFade?: number;
  time: number;
  /** The Dial's wheels lifted and lit, one by one (0…1). */
  wheels?: { parts?: number; grid?: number; months?: number; courses?: number };
  /** The observatory's grid over the eastern portals: altitude circles and the portals' edges carried up the sky (0…1). */
  grid3d?: number;
  /** The eighteen parts counted on the Dial's wheel as the Sun runs its day: `lit` parts so far (0…18, fractional; the part the
   *  Sun is crossing flares), `at` the middle of each part on the wheel, `day` the parts of daylight (gold up to it, blue after). */
  count?: { lit: number; on: number; at: THREE.Vector3[]; day: number };
  /** How strongly the Sun's circle shows its night half (0 the film's usual quiet ash-blue, 1 plainly blue). */
  nightLift?: number;
  /** The Sun's halo, as a share of its usual size (the wheel is the subject: the Sun shrinks to its point). */
  sunGlow?: number;
  /** The day and the night filling the Dial's wheel of parts as the count goes round: from bearing b0 (degrees from north, where
   *  part 1 begins) clockwise, gold for the first `day` parts and blue after, as far as `lit` parts; between radii r0 and r1 of the
   *  machine's units; on 0…1. */
  bands?: { b0: number; r0: number; r1: number; day: number; lit: number; on: number };
  /** A ring around one light, to catch it in the grid. */
  marker?: { pos: THREE.Vector3; on: number } | null;
  /** The fourth portal's twelve window-openings (72:7): how open each is (0…1); flame streams from the open ones. */
  windows?: number[];
  /** The year as tiles of light, one per day: positions, turn about the vertical (rad), colours, sizes (0 = hidden). */
  tiles?: { pos: Float32Array; rot: Float32Array; col: Float32Array; size: Float32Array };
}

export function createMachine(host: HTMLElement, lat: number, rises: number[], sets: number[], dial: HTMLCanvasElement, layers: Partial<Record<'parts' | 'grid' | 'months' | 'courses', HTMLCanvasElement>> = {}, width = 1920, height = 1080) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, width / height, .1, 3000);
  scene.background = new THREE.Color('#020205');
  const axis = new THREE.Vector3(0, Math.sin(lat * D), -Math.cos(lat * D));            // toward the celestial pole

  // ---- the stars all around (the whole sphere: from here the heaven is seen below as well as above)
  const N = 9600, sGeo = new THREE.BufferGeometry(), sPos = new Float32Array(N * 3), sCol = new Float32Array(N * 3), sSize = new Float32Array(N), sPh = new Float32Array(N), sLead = new Float32Array(N);
  for (let i = 0; i < N; i++) sPh[i] = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1)); sGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPh, 1)); sGeo.setAttribute('aLead', new THREE.BufferAttribute(sLead, 1));
  const starU = { uTime: { value: 0 }, uFade: { value: 1 } };
  scene.add(new THREE.Points(sGeo, new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; attribute float aPhase; attribute float aLead; uniform float uTime; uniform float uFade; varying vec3 vC; varying float vA;
      void main(){ float above = smoothstep(-1.2, 1.5, position.y);              // stars come forth over the rim; below it they are hidden
        vA = uFade * above * (.78 + .22*sin(uTime*(1.7+2.3*aPhase) + aPhase*40.)) * (1. + .5*aLead);
        vC = mix(color, vec3(1.,.80,.45) * max(max(color.r, color.g), color.b) * 1.25, aLead * .85);   // the leaders of the stars, in gold
        vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = aSize * (1. + .45*aLead); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - .5; float r = length(p);
      float a = exp(-r*r*18.) + .25*exp(-r*r*5.); if (a < .01) discard; gl_FragColor = vec4(vC*vA*a, 1.); }`,
  })));

  // ---- the globe: the observer stands at its top; its axis is the sky's axis; the Sun lights it from where it stands
  const globeU = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uAxis: { value: axis }, uReveal: { value: 0 } };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE, 96, 64), new THREE.ShaderMaterial({
    uniforms: globeU,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vN; uniform vec3 uSun; uniform vec3 uAxis; uniform float uReveal;
      void main(){
        float lit = smoothstep(-.06, .10, dot(vN, normalize(uSun)));
        vec3 east = vec3(1.,0.,0.), ax = normalize(uAxis), e2 = normalize(cross(ax, east)), e1 = cross(e2, ax);
        float la = asin(clamp(dot(vN, ax), -1., 1.)), lo = atan(dot(vN, e2), dot(vN, e1));
        float grid = max(1. - smoothstep(0., .022, abs(fract(la/0.2618+.5)-.5)*0.2618*${(GLOBE).toFixed(1)}),
                         1. - smoothstep(0., .022, abs(fract(lo/0.2618+.5)-.5)*0.2618*${(GLOBE).toFixed(1)}*cos(la)));
        float obs = asin(clamp(ax.y, -1., 1.));                                  // the observer's latitude on this globe
        float par = 1. - smoothstep(0., .035, abs(la - obs) * ${GLOBE.toFixed(1)});
        vec3 night = vec3(.010,.014,.026), day = vec3(.11,.14,.19);
        vec3 c = mix(night, day, lit) + grid * mix(vec3(.025,.03,.05), vec3(.20,.17,.11), lit) * .7;
        c += par * mix(vec3(.10,.10,.16), vec3(1.4,1.05,.55), lit);             // the observer's parallel: its lit share is the day
        float rim = pow(1. - abs(vN.y*.0 + dot(vN, normalize(cameraPosition))), 3.);
        c += rim * vec3(.05,.08,.14);
        gl_FragColor = vec4(c * uReveal, 1.);
      }`,
  })));
  const here = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,240,210,1)'], [.25, 'rgba(255,220,160,.5)'], [1, 'rgba(255,200,120,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  here.position.set(0, GLOBE + .15, 0); here.scale.setScalar(2.2); scene.add(here);

  // ---- the floor: the app's own Dial, dimmed, its horizon on the rim (true bearings under the gates)
  const roadU = { uReveal: { value: 0 } };
  const dialTex = new THREE.CanvasTexture(dial); dialTex.colorSpace = THREE.SRGBColorSpace; dialTex.anisotropy = 8;
  const dialMat = new THREE.MeshBasicMaterial({ map: dialTex, transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(.5, .47, .42) });
  const dialMesh = new THREE.Mesh(new THREE.CircleGeometry(DISC, 256).rotateX(-Math.PI / 2), dialMat); dialMesh.position.y = .02; dialMesh.rotation.y = -Math.PI / 2; scene.add(dialMesh);   // the picture has east at its top
  // each wheel on its own, to be lifted and lit as it is explained
  const wheelMeshes: Partial<Record<string, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }>> = {};
  for (const [k, c] of Object.entries(layers)) {
    const t = new THREE.CanvasTexture(c!); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.5, 1.4, 1.2) });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(DISC, 256).rotateX(-Math.PI / 2), mat); mesh.rotation.y = -Math.PI / 2; mesh.visible = false; scene.add(mesh);
    wheelMeshes[k] = { mesh, mat };
  }
  // the observatory's grid over the eastern portals: circles of altitude, and the portals' edges carried up the sky
  const gridMat = new THREE.LineBasicMaterial({ color: new THREE.Color(.9, .78, .5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat); scene.add(gridLines);
  let gridBuilt = false;
  function buildGrid(gates: Gate[]) {
    const pts: number[] = [], east = gates.filter((g) => g.az0 < 180), lo = Math.min(...east.map((g) => g.az0)) - 6, hi = Math.max(...east.map((g) => g.az1)) + 6;
    const P = (az: number, alt: number) => dir(az, alt).multiplyScalar(RIM);
    for (const alt of [10, 20, 30, 45, 60]) for (let a = lo; a < hi; a += 1) { const u = P(a, alt), v = P(a + 1, alt); pts.push(u.x, u.y, u.z, v.x, v.y, v.z); }
    const edges = [...new Set(east.flatMap((g) => [g.az0, g.az1]).map((x) => x.toFixed(2)))].map(Number);
    for (const az of edges) for (let alt = 0; alt < 60; alt += 1) { const u = P(az, alt), v = P(az, alt + 1); pts.push(u.x, u.y, u.z, v.x, v.y, v.z); }
    gridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); gridBuilt = true;
  }
  // the eighteen points carried down to the wheel of parts
  const dropTex = glowTexture([[0, 'rgba(255,240,200,1)'], [.3, 'rgba(255,210,140,.45)'], [1, 'rgba(255,190,110,0)']]);
  const dropNight = glowTexture([[0, 'rgba(225,238,255,1)'], [.3, 'rgba(140,175,255,.5)'], [1, 'rgba(90,130,255,0)']]);
  // the night on the wheel of parts: the stretch of the ring the day's gold does not cover
  const band = (color: THREE.Color) => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, key: '' };
  };
  const dayBand = band(new THREE.Color(1.0, .74, .32)), nightBand = band(new THREE.Color(.3, .5, 1.3));
  /** A stretch of the flat ring from bearing a to b (clockwise from north; bearing b is the angle 90° − b in the ring's own plane). */
  const setBand = (bd: ReturnType<typeof band>, a: number, b: number, r0: number, r1: number, opacity: number, y: number) => {
    bd.m.visible = opacity > .01 && b - a > .05; if (!bd.m.visible) return;
    const key = `${a.toFixed(2)}|${b.toFixed(2)}|${r0.toFixed(2)}|${r1.toFixed(2)}`;
    if (key !== bd.key) { bd.m.geometry.dispose(); bd.m.geometry = new THREE.RingGeometry(r0, r1, 120, 1, (90 - b) * D, (b - a) * D); bd.key = key; }
    (bd.m.material as THREE.MeshBasicMaterial).opacity = opacity; bd.m.position.y = y;
  };
  const drops = Array.from({ length: 18 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; scene.add(sp); return sp; });
  // a ring to catch one light in the grid
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; g.strokeStyle = 'rgba(255,230,180,.95)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); marker.visible = false; scene.add(marker);
  // the rim
  {
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 360; a += .5) pts.push(dir(a).multiplyScalar(RIM));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#8a6a3a', transparent: true, opacity: .8 })));
  }

  // ---- embers: every sunrise on the eastern rim, every sunset on the western
  const ember = (azs: number[]) => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(azs.length * 3), d = new Float32Array(azs.length);
    azs.forEach((az, i) => { const v = dir(az).multiplyScalar(RIM); p.set([v.x, .3, v.z], i * 3); d[i] = i; });
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aDay', new THREE.BufferAttribute(d, 1));
    const u = { uDay: { value: -1 } };
    scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aDay; uniform float uDay; varying float vA;
        void main(){ float age = uDay - aDay; vA = step(0., age) * (.35 + .65*exp(-age/4.));
          vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = (2.5 + 4.*exp(-max(age,0.)/3.)) * 380. / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 p = gl_PointCoord - .5; float a = exp(-dot(p,p)*14.);
        if (a*vA < .004) discard; gl_FragColor = vec4(vec3(1.,.72,.36)*a*vA*1.4, 1.); }`,
    })));
    return u;
  };
  const riseU = ember(rises), setU = ember(sets);

  // ---- the Sun's daily circle: gold where it runs above the road (the day), ash-blue below (the night)
  const circleMat = new THREE.ShaderMaterial({
    uniforms: { uO: { value: 1 }, uN: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying float vY; uniform float uO; uniform float uN; void main(){ float day = smoothstep(-.4, .4, vY);
      gl_FragColor = vec4(mix(mix(vec3(.16,.22,.38)*.8, vec3(.42,.62,1.25), uN), vec3(1.5,1.1,.55), day) * uO, 1.); }`,
  });
  const circle = new THREE.Mesh(new THREE.BufferGeometry(), circleMat); scene.add(circle);
  // the Moon's daily circle, in silver: the same treatment as the Sun's (72:3, 72:37)
  const moonPathMat = new THREE.ShaderMaterial({
    uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying float vY; uniform float uO; void main(){ float up = smoothstep(-.4, .4, vY);
      gl_FragColor = vec4(mix(vec3(.10,.12,.2), vec3(.85,.92,1.1), up) * uO, 1.); }`,
  });
  const moonPath = new THREE.Mesh(new THREE.BufferGeometry(), moonPathMat); scene.add(moonPath);
  let moonKey = '';
  const ghostMats: THREE.ShaderMaterial[] = [], ghosts: THREE.Mesh[] = [];
  const circleGeo = (dec: number, from: number, span: number, r: number) => {
    const pts: THREE.Vector3[] = [], n = Math.max(2, Math.ceil(240 * span));
    for (let i = 0; i <= n; i++) pts.push(onCircle(lat, dec, from + (2 * Math.PI) * span * (i / n)));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, r, 6, false);
  };
  const coolCol = new THREE.Color(.55, .68, 1);
  const ticks = new THREE.Group(); scene.add(ticks);
  const tickMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.0, .6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const tickNight = new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, .38, .6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 18; k++) ticks.add(new THREE.Mesh(new THREE.SphereGeometry(.9, 12, 8), tickMat));

  // ---- the Sun
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,245,215,1)'], [.08, 'rgba(255,220,160,.95)'], [.3, 'rgba(255,170,80,.30)'], [1, 'rgba(255,120,40,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2.1, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.6) }));
  scene.add(sunGlow, sunDisc);

  // ---- the Moon, as the observer on the earth sees it (its disc the same size as the Sun's, 72:37): a disc turned to the camera, lit on the side toward the Sun by
  //      its true illuminated fraction (cos i = 2k − 1, i the phase angle)
  const moonU = { uCosI: { value: 1 }, uAngle: { value: 0 }, uOn: { value: 0 } };
  const moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.ShaderMaterial({
    uniforms: moonU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv*2.-1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec2 vU; uniform float uCosI; uniform float uAngle; uniform float uOn;
      void main(){ float r = length(vU); if (r > 1.) discard;
        float c = cos(-uAngle), s = sin(-uAngle); vec2 q = vec2(c*vU.x - s*vU.y, s*vU.x + c*vU.y);      // x toward the Sun on screen
        vec3 n = vec3(q, sqrt(1. - r*r)), L = vec3(sqrt(max(0., 1. - uCosI*uCosI)), 0., uCosI);
        float l = smoothstep(-.04, .06, dot(n, L)), edge = smoothstep(1., .94, r);
        gl_FragColor = vec4(mix(vec3(.035,.04,.06), vec3(1.25,1.24,1.3), l) * edge * uOn, edge * uOn); }`,
  }));
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(225,232,255,.7)'], [.25, 'rgba(190,205,255,.15)'], [1, 'rgba(160,180,255,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  scene.add(moonMesh, moonGlow);

  // ---- the year as tiles of light (one per day), placed by the scene each frame
  const TILES = 364, tileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), TILES);
  tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TILES * 3), 3); tileMesh.visible = false; tileMesh.frustumCulled = false; scene.add(tileMesh);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

  // ---- the fourth portal's twelve window-openings and their flame (72:7), built when first asked for
  const WIN = 12, PER = 170;
  const winU = { uTime: { value: 0 }, uOpen: { value: new Array(WIN).fill(0) } };
  let winBuilt = false; const winSlits: THREE.Mesh[] = [];
  const winMat = (k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, .45), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, name: String(k) });
  function buildWindows(g: Gate) {
    const pos: number[] = [], wi: number[] = [], ph: number[] = [];
    let seed = 4242; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // the same sparks in every render tab
    for (let k = 0; k < WIN; k++) {
      const az = g.az0 + (g.az1 - g.az0) * ((k + .5) / WIN), v = dir(az).multiplyScalar(RIM * 1.003);
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(.38, 6.5), winMat(k)); slit.position.set(v.x, 8.5, v.z); slit.lookAt(0, 8.5, 0); scene.add(slit); winSlits.push(slit);
      for (let i = 0; i < PER; i++) { pos.push(v.x, 8.5 + (rnd() - .5) * 6, v.z); wi.push(k); ph.push(rnd()); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aWin', new THREE.Float32BufferAttribute(wi, 1)); geo.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
    scene.add(new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: winU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aWin; attribute float aPh; uniform float uTime; uniform float uOpen[${WIN}]; varying float vA; varying float vT;
        void main(){ int w = int(aWin + .5); float open = 0.; for (int k = 0; k < ${WIN}; k++) if (k == w) open = uOpen[k];
          float t = fract(aPh + uTime * (.55 + .3*fract(aPh*7.)));                    // each spark streams outward, then is renewed
          vec3 flow = -normalize(vec3(position.x, 0., position.z));                     // the flame pours inward, into the world
          vec3 p = position + flow * t * 22. + vec3(0., t*t*9. + sin(aPh*40. + uTime*3.)*t*1.2, 0.) + cross(flow, vec3(0.,1.,0.)) * sin(aPh*90. + uTime*2.)*t*2.4;
          vA = open * (1. - t) * smoothstep(0., .08, t); vT = t;
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = min(36., (3. + 9.*(1.-t)) * 180. / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying float vT; void main(){ vec2 q = gl_PointCoord - .5; float a = exp(-dot(q,q)*12.);
        if (a < .02) discard; vec3 c = mix(vec3(1.,.9,.55), vec3(1.,.32,.06), vT); gl_FragColor = vec4(c * a * vA * .55, 1.); }`,
    })));
    winBuilt = true;
  }

  // ---- the portals: pillars and arches of light; the small portals above (36:2–3); the windows beside (72:3)
  const H = 16, UP = 7;
  const gold = (o: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(.72, .55, .31), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const gateObjs: { group: THREE.Group; mats: THREE.MeshBasicMaterial[] }[] = [];
  function buildGate(g: Gate) {
    const group = new THREE.Group(), main = gold(1), small = gold(.7), win = gold(.55);
    const p0 = dir(g.az0).multiplyScalar(RIM), p1 = dir(g.az1).multiplyScalar(RIM);
    for (const p of [p0, p1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, H, 8), main); m.position.set(p.x, H / 2, p.z); group.add(m); }
    const arch = (a: number, b: number, y: number, up: number, r: number, mat: THREE.Material) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(dir(a + (b - a) * t).multiplyScalar(RIM).setY(y + up * Math.sin(Math.PI * t))); }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, r, 6, false), mat));
    };
    arch(g.az0, g.az1, H, UP, .22, main);
    const mid = (g.az0 + g.az1) / 2, w = (g.az1 - g.az0) * .22;                       // a small portal above, for the stars
    arch(mid - w, mid + w, H + UP + 2.2, 3.2, .16, small);
    for (const y of [H + UP + 2.2]) for (const az of [mid - w, mid + w]) { const v = dir(az).multiplyScalar(RIM); const m = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 2.2, 6), small); m.position.set(v.x, y - 1.1, v.z); group.add(m); }
    for (const s of [-1, 1]) {                                                       // windows to the right and left
      const az = (s < 0 ? Math.min(g.az0, g.az1) : Math.max(g.az0, g.az1)) + s * .9, v = dir(az).multiplyScalar(RIM * 1.002);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.9, 3.2), win); m.position.set(v.x, H * .55, v.z); m.lookAt(0, H * .55, 0); group.add(m);
    }
    scene.add(group);
    return { group, mats: [main, small, win] };
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), .7, .5, .5));
  composer.addPass(new OutputPass());

  let circleKey = '';
  function render(s: MState) {
    camera.position.copy(s.camera.pos); camera.up.copy(s.camera.up); camera.fov = s.camera.fov; camera.updateProjectionMatrix(); camera.lookAt(s.camera.look);
    // stars
    for (let i = 0; i < Math.min(N, s.stars.length); i++) {
      const st = s.stars[i], v = dir(st.az, st.alt).multiplyScalar(RIM);
      sPos.set([v.x, v.y, v.z], i * 3); sLead[i] = st.lead ? 1 : 0;
      const b = Math.pow(10, -0.4 * (st.mag - 1.5)), w = Math.min(1.5, .3 + b);
      sCol.set([st.rgb[0] * w, st.rgb[1] * w, st.rgb[2] * w], i * 3);
      sSize[i] = Math.max(1.3, Math.min(7.5, 5.4 - .95 * st.mag));
    }
    sGeo.setDrawRange(0, Math.min(N, s.stars.length));
    for (const a of ['position', 'color', 'aSize', 'aLead'] as const) (sGeo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
    starU.uTime.value = s.time; starU.uFade.value = .35 + .65 * s.reveal;
    globeU.uReveal.value = s.reveal; roadU.uReveal.value = s.reveal;
    // today's circle, drawn from sunrise
    const H0 = sunriseH(s.lat, s.dec), key = `${s.dec.toFixed(3)}|${s.draw.toFixed(3)}`;
    if (key !== circleKey) { circle.geometry.dispose(); circle.geometry = s.draw > .002 ? circleGeo(s.dec, H0, s.draw, .38) : new THREE.BufferGeometry(); circleKey = key; }
    const pg = s.pathGlow ?? 1;
    circleMat.uniforms.uN.value = s.nightLift ?? 0; circleMat.uniforms.uO.value = pg; tickMat.opacity = pg; tickNight.opacity = pg;
    if (s.moon) {                                                             // its circle: the declination of where it stands now
      const D2 = Math.PI / 180, decM = Math.asin(Math.sin(lat * D2) * Math.sin(s.moon.alt * D2) + Math.cos(lat * D2) * Math.cos(s.moon.alt * D2) * Math.cos(s.moon.az * D2)) / D2;
      // drawn from where it rises, as far as it has come (the Moon's own circle, so it comes up out of and goes down into its own portals)
      const pr = s.moon.pathReveal; let from = 0, span = 1;
      if (pr !== undefined && pr < 1) {
        const dm = decM * D2, h0 = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat * D2) * Math.tan(dm)))), mv = dir(s.moon.az, s.moon.alt);
        const hm = Math.atan2(-mv.x, (mv.y - Math.sin(lat * D2) * Math.sin(dm)) / Math.cos(lat * D2)), arc = (2 * h0) / (2 * Math.PI);
        from = -h0; span = pr < 0 ? 0 : pr > 0 ? arc + (1 - arc) * smoothstep01(pr) : Math.max(0, Math.min(2 * Math.PI, hm + h0)) / (2 * Math.PI);
      }
      const k2 = `${decM.toFixed(2)}|${span.toFixed(3)}`; if (k2 !== moonKey) { moonPath.geometry.dispose(); moonPath.geometry = span > .002 ? circleGeo(decM, from, span, .3) : new THREE.BufferGeometry(); moonKey = k2; }
      moonPathMat.uniforms.uO.value = (s.moonGlow ?? pg) * s.moon.on; moonPath.visible = s.moon.on > .01 && span > .002;
    } else moonPath.visible = false;
    s.ghosts.forEach((gh, i) => {
      while (ghosts.length <= i) { const m = circleMat.clone(); m.uniforms.uO.value = 0; ghostMats.push(m); const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m); scene.add(mesh); ghosts.push(mesh); }
      const k = gh.dec.toFixed(2);
      if (ghosts[i].userData.k !== k) { ghosts[i].geometry.dispose(); ghosts[i].geometry = circleGeo(gh.dec, 0, 1, .12); ghosts[i].userData.k = k; }
      ghostMats[i].uniforms.uO.value = gh.o; ghosts[i].visible = gh.o > .005;
    });
    for (let i = s.ghosts.length; i < ghosts.length; i++) ghosts[i].visible = false;
    // the eighteen parts, from sunrise
    ticks.children.forEach((t, k) => {
      const p = onCircle(s.lat, s.dec, H0 + (2 * Math.PI * k) / 18); t.position.copy(p);
      (t as THREE.Mesh).material = p.y >= -.01 ? tickMat : tickNight; t.visible = s.parts > k / 18 && s.draw >= k / 18;
    });
    // the Sun
    const sp = onCircle(s.lat, s.dec, s.sunH);
    sunDisc.position.copy(sp); sunGlow.position.copy(sp); sunGlow.scale.setScalar(26 * s.sunOn * (s.sunGlow ?? 1)); sunDisc.visible = s.sunOn > .02; sunGlow.material.opacity = s.sunOn;
    globeU.uSun.value.copy(sp).normalize();
    moonMesh.visible = moonGlow.visible = !!s.moon && s.moon.on > .01;
    if (s.moon) {
      const mp = dir(s.moon.az, s.moon.alt).multiplyScalar(RIM), up = smoothstep01((s.moon.alt + 1.5) / 3);
      moonMesh.position.copy(mp); moonMesh.quaternion.copy(camera.quaternion); moonGlow.position.copy(mp);
      camera.updateMatrixWorld();
      const a = mp.clone().project(camera), b = sp.clone().project(camera);                    // the bright limb faces the Sun on screen
      moonU.uAngle.value = Math.atan2((b.y - a.y) * height, (b.x - a.x) * width) * (b.z > 1 ? -1 : 1);
      moonU.uCosI.value = 2 * s.moon.fraction - 1; moonU.uOn.value = s.moon.on * up;
      moonGlow.scale.setScalar(12 * s.moon.on * (.3 + .7 * s.moon.fraction)); moonGlow.material.opacity = s.moon.on * up;
    }
    // portals
    s.gates.forEach((g, i) => {
      if (!gateObjs[i]) gateObjs[i] = buildGate(g);
      const o = gateObjs[i]; o.group.visible = g.rise > 0;
      o.group.position.y = -H * 1.4 * (1 - g.rise); o.mats[0].opacity = g.rise; o.mats[1].opacity = .7 * g.rise; o.mats[2].opacity = .55 * g.rise;
      o.mats[0].color.setRGB(.72, .55, .31).lerp(coolCol, g.cool ?? 0).multiplyScalar(1 + 2.2 * (g.glow ?? 0));
    });
    riseU.uDay.value = s.day; setU.uDay.value = s.day;
    // the wheels, the grid, the points, the ring
    const W = s.wheels ?? {}, anyWheel = Math.max(W.parts ?? 0, W.grid ?? 0, W.months ?? 0, W.courses ?? 0);
    dialMat.opacity = .5 * s.reveal * (1 - .45 * anyWheel) * (s.floorFade ?? 1);
    for (const [k, w] of Object.entries(wheelMeshes)) { const v = (W as Record<string, number | undefined>)[k] ?? 0; w!.mesh.visible = v > .002; w!.mat.opacity = v * .9; w!.mesh.position.y = .05 + 3.5 * v; }
    if (!gridBuilt && s.gates.length) buildGrid(s.gates);
    gridMat.opacity = .55 * (s.grid3d ?? 0); gridLines.visible = (s.grid3d ?? 0) > .002;
    const wy = .05 + 3.5 * (W.parts ?? 0);
    drops.forEach((sp, k) => {
      const c = s.count; sp.visible = !!c && c.on > .01; if (!c) return;
      const lit = Math.max(0, Math.min(1, c.lit - k)), flare = Math.max(0, 1 - Math.abs(c.lit - (k + .5)) / .9);
      sp.position.copy(c.at[k]); sp.position.y = wy + .7; sp.scale.setScalar(4.2 * (1 + .9 * flare)); sp.material.opacity = c.on * (.16 + .84 * lit);
      sp.material.map = k + .5 > c.day ? dropNight : dropTex;                                          // gold for the parts of the day, blue for the night's
    });
    const bd = s.bands, bOn = bd ? bd.on : 0;
    if (bd) {
      const goldTo = bd.b0 + Math.min(bd.lit, bd.day) * 20, blueFrom = bd.b0 + bd.day * 20, blueTo = bd.b0 + Math.max(bd.day, Math.min(bd.lit, 18)) * 20;
      setBand(dayBand, bd.b0, goldTo, bd.r0, bd.r1, .9 * bOn, wy + .25); setBand(nightBand, blueFrom, blueTo, bd.r0, bd.r1, .8 * bOn, wy + .25);
    } else { dayBand.m.visible = false; nightBand.m.visible = false; }
    tileMesh.visible = !!s.tiles;
    if (s.tiles) {
      const t = s.tiles;
      for (let i = 0; i < TILES; i++) {
        const z = t.size[i]; tv.set(t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2]); tq.setFromAxisAngle(yAxis, t.rot[i]);
        ts.set(z * .9, z * .32, z * 1.7); tm.compose(tv, tq, ts); tileMesh.setMatrixAt(i, tm);
        tileMesh.instanceColor!.setXYZ(i, t.col[i * 3], t.col[i * 3 + 1], t.col[i * 3 + 2]);
      }
      tileMesh.instanceMatrix.needsUpdate = true; tileMesh.instanceColor!.needsUpdate = true;
    }
    if (s.windows && !winBuilt) { const g4 = s.gates.find((g) => g.portal === 4 && g.az0 < 180); if (g4) buildWindows(g4); }
    winU.uTime.value = s.time;
    for (let k = 0; k < WIN; k++) { const o = s.windows?.[k] ?? 0; winU.uOpen.value[k] = o; if (winSlits[k]) (winSlits[k].material as THREE.MeshBasicMaterial).opacity = Math.min(1, o * 1.2); }
    marker.visible = !!s.marker && s.marker.on > .01;
    if (s.marker) { marker.position.copy(s.marker.pos); marker.scale.setScalar(9 + 2 * Math.sin(s.time * 3)); marker.material.opacity = s.marker.on; }
    composer.render();
  }
  const probe = new THREE.PerspectiveCamera(40, width / height, .1, 3000);
  function project(v: THREE.Vector3, cam: MState['camera']) {
    probe.position.copy(cam.pos); probe.up.copy(cam.up); probe.fov = cam.fov; probe.updateProjectionMatrix(); probe.lookAt(cam.look); probe.updateMatrixWorld();
    const p = v.clone().project(probe); return p.z > 1 ? null : { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height };
  }
  /** Show the Dial (or one of its wheels) as drawn for another day; null puts back the picture it was made with. */
  const firstImage = new Map<string, unknown>();
  function setDial(which: 'floor' | 'parts' | 'grid' | 'months' | 'courses', c: HTMLCanvasElement | null) {
    const t = which === 'floor' ? dialTex : (wheelMeshes[which]?.mat.map ?? null); if (!t) return;
    if (!firstImage.has(which)) firstImage.set(which, t.image);
    const img = c ?? firstImage.get(which);
    if (t.image !== img) { t.image = img; t.needsUpdate = true; }
  }
  return { scene, render, project, setDial, gateTop: (g: Gate) => dir((g.az0 + g.az1) / 2).multiplyScalar(RIM).setY(H + UP + 8), dispose: () => { renderer.dispose(); renderer.domElement.remove(); } };
}
export type Machine = ReturnType<typeof createMachine>;
