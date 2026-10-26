// The heavenly vantage of the Sun film: the ascent through the stars, then a house of crystal
// above and west of the machine, whose ceiling is like the path of the stars, ringed with tongues of fire, its floor
// clear crystal through which the machine is seen (the image of 1 Enoch 14:9–12, shown but not captioned with ch. 14).
// At its edge stand Enoch, a soft being of warm light, and Uriel, a column of starlight in the suggestion of a form. All of this is presentation: no
// computed values are drawn here.
import * as THREE from 'three';
import { glowTexture } from './world';

/** The house floats above and west of the machine; from its eastern edge the machine lies below and ahead, to the east. */
export const HOUSE = new THREE.Vector3(-520, 480, 0), HALL = 60;
/** Where the two stand: the eastern edge of the floor. */
export const EDGE = HALL - 7;
/** The ascent happens in its own place, far from the machine, and ends in light. */
export const ASCENT_X = 6000;

export interface HeavenState { time: number; ascent: number; house: number; figures: number; uriel: number }

/** A robed, hooded form (radius by height, height in units of the figure's own scale). */
const PROFILE = [[0, .30], [.3, .28], [.72, .24], [.95, .235], [1.08, .27], [1.16, .25], [1.22, .14], [1.27, .12], [1.36, .135], [1.45, .12], [1.52, .07], [1.54, 0]];
const radiusAt = (y: number) => { for (let k = 1; k < PROFILE.length; k++) if (y <= PROFILE[k][0]) { const [y0, r0] = PROFILE[k - 1], [y1, r1] = PROFILE[k]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0; };

/** A figure of particles inside the form; each drifts upward along its own slow wave and fades as it rises. */
function wisps(scale: number, n: number, kind: 'soul' | 'edge' | 'star', seed: number) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n * 2);
  let s0 = seed; const rnd = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const y = Math.pow(rnd(), kind === 'star' ? .9 : .8) * 1.54, rr = radiusAt(y), a = rnd() * Math.PI * 2;
    const r = rr * (kind === 'edge' ? .92 + .1 * rnd() : Math.sqrt(rnd()));
    pos.set([r * Math.cos(a) * scale, y * scale, r * Math.sin(a) * scale], i * 3); ph.set([rnd(), rnd()], i * 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 2));
  const u = { uTime: { value: 0 }, uOn: { value: 0 }, uH: { value: 1.54 * scale } };
  const col = kind === 'soul' ? 'mix(vec3(1.,.86,.66), vec3(1.,.95,.86), aPh.y)' : kind === 'edge' ? 'vec3(1.,.84,.6)' : 'mix(vec3(1.,.9,.72), vec3(.8,.88,1.), aPh.y)';
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec2 aPh; uniform float uTime; uniform float uOn; uniform float uH; varying float vA; varying vec3 vC;
      void main(){
        float t = fract(aPh.x + uTime * ${kind === 'star' ? '.035' : '.025'});                   // each wisp rises and is renewed
        vec3 p = position; p.y += t * uH * ${kind === 'star' ? '.35' : '.22'};
        p.x += sin(uTime*.6 + aPh.y*20. + p.y*.4) * .35 * t; p.z += cos(uTime*.5 + aPh.x*17. + p.y*.3) * .35 * t;
        float life = smoothstep(0., .15, t) * (1. - smoothstep(.55, 1., t));
        float tw = ${kind === 'star' ? '.35 + .65*pow(.5 + .5*sin(uTime*(2.+3.*aPh.y) + aPh.x*60.), 6.)' : kind === 'soul' ? '.7 + .3*sin(uTime*1.3 + aPh.x*40.)' : '1.'};
        vA = life * tw * uOn; vC = ${col};
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = ${kind === 'soul' ? '3.2' : kind === 'edge' ? '1.8' : '1.4 + 2.2*tw'} * 260. / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 q = gl_PointCoord - .5; float a = exp(-dot(q,q)*${kind === 'soul' ? '10.' : '16.'});
      gl_FragColor = vec4(vC * a * vA * ${kind === 'soul' ? '.022' : kind === 'edge' ? '.16' : '.30'}, 1.); }`,
  });
  return { points: new THREE.Points(g, mat), u };
}

export function createHeaven(scene: THREE.Scene) {
  // ---- the ascent: a column of light-points rushing past (streaks), in a place of its own
  const n = 2600, pos: number[] = [], col: number[] = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const r = 6 + Math.pow(rnd(), .6) * 70, a = rnd() * Math.PI * 2, y = rnd() * 1400, len = 2 + rnd() * 9, x = ASCENT_X + r * Math.cos(a), z = r * Math.sin(a);
    pos.push(x, y, z, x, y + len, z);
    const w = .5 + rnd() * .5, tint = rnd();
    const c = tint < .15 ? [1, .82, .55] : tint < .3 ? [.75, .82, 1] : [1, 1, 1];
    col.push(...c.map((v) => v * w * .5), ...c.map((v) => v * w * 2.2));
  }
  const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ag.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const ascentMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const ascent = new THREE.LineSegments(ag, ascentMat); scene.add(ascent);

  // ---- the house
  const house = new THREE.Group(); house.position.copy(HOUSE); scene.add(house);
  const U = { uTime: { value: 0 }, uOn: { value: 0 } };
  // the floor: clear crystal, "like a tesselated floor (made) of crystals" (14:10), "their heaven was (clear as) water" (14:11)
  house.add(new THREE.Mesh(new THREE.CircleGeometry(HALL, 192).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; uniform float uTime; uniform float uOn;
      float seam(vec2 p, vec2 n){ float t = fract(dot(p, n)); return 1. - smoothstep(0., .012, min(t, 1. - t)); }
      void main(){ float r = length(vP.xz); vec2 p = vP.xz * .16;
        float line = max(seam(p, vec2(1., 0.)), max(seam(p, vec2(.5, .8660254)), seam(p, vec2(-.5, .8660254))));   // a tessellation of triangles
        float shimmer = .5 + .5*sin(vP.x*.21 + vP.z*.17 + uTime*.7);
        float rim = smoothstep(${(HALL - 2.5).toFixed(1)}, ${HALL.toFixed(1)}, r);
        vec3 c = vec3(.62,.74,.92) * (.015 + .24*line*(.5 + .5*shimmer)) + vec3(1.,.86,.62) * rim * .5;
        float a = (.04 + .22*line + .5*rim) * uOn;
        gl_FragColor = vec4(c * uOn, a); }`,
  })));
  // the ceiling, "like the path of the stars and the lightnings" (14:11): a crystal dome traced with the stars' circles
  const pathMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying float vT; uniform float uTime; uniform float uOn;
      void main(){ float moving = pow(.5 + .5*sin(vT*40. - uTime*1.6), 18.); gl_FragColor = vec4(vec3(.75,.82,1.) * (.10 + .9*moving) * uOn, 1.); }`,
  });
  {
    const pts: number[] = [], ts: number[] = [], R = HALL * .98, axis = new THREE.Vector3(.35, 1, .1).normalize();
    const e1 = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(1, 0, 0)).normalize(), e2 = new THREE.Vector3().crossVectors(axis, e1);
    for (let k = 1; k <= 11; k++) {                                     // circles about a pole, as the stars turn
      const dec = (k / 12) * Math.PI / 2 * 1.6 - .2, cr = Math.cos(dec) * R, h = Math.sin(dec) * R;
      for (let i = 0; i < 160; i++) for (const j of [i, i + 1]) {
        const a = (j / 160) * Math.PI * 2, v = axis.clone().multiplyScalar(h).addScaledVector(e1, cr * Math.cos(a)).addScaledVector(e2, cr * Math.sin(a));
        if (v.y < 4) continue; pts.push(v.x, v.y, v.z); ts.push(j / 160 + k * .37);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    house.add(new THREE.LineSegments(g, pathMat));
  }
  house.add(new THREE.Mesh(new THREE.SphereGeometry(HALL, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0a1220', transparent: true, opacity: .35, side: THREE.BackSide, depthWrite: false })));
  // the walls, "surrounded by tongues of fire" (14:9)
  const fire = new THREE.Mesh(new THREE.CylinderGeometry(HALL * 1.002, HALL * 1.002, 4.2, 384, 1, true), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec2 vU; uniform float uTime; uniform float uOn;
      float n(vec2 p){ return fract(sin(dot(floor(p), vec2(12.9898,78.233)))*43758.5453); }
      float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(n(i), n(i+vec2(1,0)), f.x), mix(n(i+vec2(0,1)), n(i+vec2(1,1)), f.x), f.y); }
      void main(){ float x = vU.x * 260., y = vU.y;
        float lap = sin(x * .9 - uTime * 4.2 + sin(x * .23 + uTime) * 2.) * .06;          // the tongues lap sideways as they rise
        float tongue = pow(abs(sin(x * 1.7 + sn(vec2(x * .3, uTime * .8)) * 3.)), 1.6);     // separate tongues, not a wall
        float h = .25 + .5 * tongue * (.55 + .45 * sn(vec2(x * 1.3, uTime * 2.4))) + .15 * sn(vec2(x * 4., uTime * 3.6));
        float yy = y + lap * y;
        float flame = smoothstep(h, h - .3, yy) * (1. - yy * .6);
        vec3 c = mix(vec3(1., .28, .04), mix(vec3(1., .72, .28), vec3(1., .95, .8), smoothstep(.55, 1., flame)), flame);
        gl_FragColor = vec4(c * flame * .8 * uOn, 1.); }`,
  }));
  fire.position.y = 2.1; house.add(fire);

  // ---- Enoch, a silhouette; Uriel, a tall figure of light, at the edge of the opening, facing east and down
  // Both are made of particles: a body of drifting wisps, denser at the heart and fraying at the edges, rising and
  // thinning as they leave the form. Enoch: a soft warm light with a faint pale edge. Uriel: starlight, twinkling, only the
  // suggestion of a form, with a tall soft glow. Both are light; Enoch, the man, is the smaller and softer, warm
  // ivory; Uriel, the angel over the luminaries, the taller, made of starlight.
  const enoch = wisps(6.2, 5000, 'soul', 11); enoch.points.position.set(EDGE, 0, -3.6); house.add(enoch.points);
  const enochEdge = wisps(6.25, 900, 'edge', 23); enochEdge.points.position.set(EDGE, 0, -3.6); house.add(enochEdge.points);
  const uriel = wisps(8.6, 2600, 'star', 37); uriel.points.position.set(EDGE - .5, 0, 4.4); house.add(uriel.points);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,245,225,.16)'], [.35, 'rgba(255,230,190,.04)'], [1, 'rgba(255,220,170,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.position.set(EDGE - .5, 7.2, 4.4); halo.scale.set(16, 30, 1); house.add(halo);

  function update(h: HeavenState) {
    U.uTime.value = h.time; U.uOn.value = h.house;
    ascent.visible = h.ascent > .001; ascentMat.opacity = h.ascent;
    house.visible = h.house > .001;
    for (const w of [enoch, enochEdge]) { w.u.uTime.value = h.time; w.u.uOn.value = h.figures; }
    uriel.u.uTime.value = h.time; uriel.u.uOn.value = h.uriel; halo.material.opacity = h.uriel;
  }
  return { update };
}
