// The Sun film, from the beginning through the machine:
//   1  0:00–0:06  the ascent: swept up through the stars (no verse: 14:8 belongs to the throne vision)
//   2  0:06–0:16  the house of crystal, its ceiling like the path of the stars, ringed with fire (image only);
//                 Enoch, a silhouette, and Uriel, a tall figure of light, at the opening in its floor; 72:1, 74:2
//   3  0:16–0:22  the gaze descends through the opening onto the machine, east at the top
//   4  0:22–0:46  the machine: the lights come forth (the approved look test)
//   5  0:46–1:31  the Dial, wheel by wheel: the 18 parts (72:14); the portals as the observatory's grid, a leader of
//                 the stars caught in it (72:3); the months and their portals (72:13); the year complete (82:6, 72:32)
import { useLayoutEffect } from 'react';
import { useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { cond, ease, Fill, geez, GEEZ_ON, ink, mono, ramp, serif } from '../shared';
const num = (n: number) => (GEEZ_ON ? GEEZ[n] : String(n));
import { GEEZ } from '../../../src/model';
import { dir } from './world';
import { ASCENT_X, EDGE, HOUSE } from './heaven';
import { useMachine } from './Revealed';
import { D0, DAY0, DS, E0, MO, MONTH_OFF, MT, OFF, PB, PT, SA, SPEED, VISION_END, outFrame } from './timeline';
export const VISION = { end: outFrame(VISION_END) };
import { annual } from '../../../src/model';
import { sunriseH } from './machine';
import { DR } from '../../../src/dial/render';
import { useDialAt } from './dialAt';

/** The six-year helix: every week (false) or only the six weeks that head the years (true). */
const HELIX_HEADS_ONLY = false;
const SEQ = [4, 5, 6, 6, 5, 4, 3, 2, 1, 1, 2, 3];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type Cam = { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; fov: number };
const mix = (a: Cam, b: Cam, t: number): Cam => ({ pos: a.pos.clone().lerp(b.pos, t), look: a.look.clone().lerp(b.look, t), up: a.up.clone().lerp(b.up, t).normalize(), fov: lerp(a.fov, b.fov, t) });

/** The film. The verses are not in the picture: the app lays them over it as live text, from the same cues (cues.ts). */
export function SunVision() {
  const f = useCurrentFrame() * SPEED, g = f - OFF;   // story frames: the film is written at 1x and played SPEED times faster (timeline.ts)
  const M = useMachine(g, true);

  // ---- the camera, scene by scene
  const climb = ease(ramp(f, 0, 190));
  const ascent: Cam = { pos: V(ASCENT_X, lerp(-40, 1150, climb), 0), look: V(ASCENT_X + 6 * Math.sin(f / 40), lerp(-40, 1150, climb) + 60, 6 * Math.cos(f / 40)), up: V(Math.sin(f / 90), 0, Math.cos(f / 90)), fov: 72 };
  const H = (x: number, y: number, z: number) => HOUSE.clone().add(V(x, y, z));
  const wide: Cam = { pos: H(8, 15, 36), look: H(EDGE, 7, 0), up: V(0, 1, 0), fov: 50 };
  const near: Cam = { pos: H(26, 12, 24), look: H(EDGE, 7, .5), up: V(0, 1, 0), fov: 48 };
  const shoulder: Cam = { pos: H(EDGE - 34, 26, -1), look: V(0, 0, 0), up: V(0, 1, 0), fov: 58 };
  const above: Cam = { pos: V(-260, 420, 0), look: V(0, 0, 0), up: V(.7, .7, 0), fov: 50 };
  const camera = f < 195 ? ascent
    : f < 330 ? mix(wide, near, ease(ramp(f, 200, 330)))
      : f < 480 ? mix(near, shoulder, ease(ramp(f, 330, 440)))
        : f < 545 ? mix(shoulder, above, ease(ramp(f, 480, 545)))
          : f < OFF ? mix(above, M.camera, ease(ramp(f, 545, OFF)))
            : f < D0 ? M.camera
              : f < E0 ? dialCamera(f - D0, M.camera)
                : endCamera(f - E0, dialCamera(DS.year[1], M.camera));

  // ---- the heaven: the ascent, then the house and the two who stand in it; it falls away as the gaze descends
  const leave = 1 - ramp(f, 545, 620);
  const heaven = {
    time: f / 30, ascent: ramp(f, 0, 25) * (1 - ramp(f, 180, 200)),
    house: ramp(f, 186, 220) * leave, figures: ramp(f, 205, 250) * leave, uriel: ease(ramp(f, 255, 320)) * leave,
  };
  const reveal = Math.max(M.state.reveal, ease(ramp(f, 200, 600)));

  // ---- scene 5: the Dial, wheel by wheel
  const h = f - D0, X = M.extra;
  const up = (a: number, b: number, k = 30) => ease(ramp(h, a, a + k)) * (1 - ease(ramp(h, b - k, b)));
  const coursesUp = up(DS.priests[0] + 200, DS.priests[0] + PB.helix[0] + 30);
  const wheels = { parts: up(DS.parts[0] + PT.lift[0] - 30, DS.light[1]), grid: up(DS.grid[0] + 20, DS.grid[1]), months: up(DS.months[0] + 10, DS.seasons[1] - 60), courses: coursesUp };
  const grid3d = up(DS.grid[0] + 30, DS.grid[1]);
  // a leader of the stars caught in the grid: chosen once, at the moment the grid is drawn, then followed
  const CATCH = [DS.grid[0] + 110, DS.grid[0] + 260] as const, catchAt = X.jdAt(MT.end + CATCH[0]);
  const caught = (() => {
    if (!X.skyAt) return -1;
    const sky0 = X.skyAt(catchAt).stars; let best = -1;
    sky0.forEach((p, k) => { if (X.lead[k] && p.alt > 1 && p.alt < 7 && p.az > 55 && p.az < 125 && (best < 0 || X.mags[k] < X.mags[best])) best = k; });   // just come forth through a portal
    return best;
  })();
  const caughtNow = caught >= 0 ? M.state.stars[caught] : null;
  const marker = caughtNow && h > DS.grid[0] ? { pos: dir(caughtNow.az, caughtNow.alt).multiplyScalar(100), on: up(CATCH[0], CATCH[1], 20) } : null;
  // the gates answer: each month lights its portal in turn; then the four that divide the year
  // the light through the year: the wheel of parts turning day by day, its gold share growing and shrinking
  const rows = M.doc ? annual(M.doc) : [];
  // the Sun's circle is the subject from the parts scene through the year of light: one clock for the day on show, so the
  // date glides from the morning the machine showed to the morning of ten parts (72:10), on to the longest day (72:14), and
  // from there through the year, with nothing jumping where one scene hands over to the next
  // the Sun runs its day at a steady pace (the parts are equal stretches of time) while the wheel counts them; as the camera lifts
  // over the wheel it becomes the subject, and the Sun's circle and halo quiet down: half way while the Sun runs, then to a hairline
  const runFrac = ramp(h, PT.run[0], PT.run[1]), runParts = 18 * runFrac;
  const focus = ease(ramp(h, PT.lift[0], PT.lift[1])), settled = ease(ramp(h, PT.run[0] + 150, PT.run[1]));   // the circle goes to a hairline across the night leg, in time for the labels
  const sunUp = h >= DS.parts[0] && h < DS.light[1] ? 1 - ease(ramp(h, DS.light[1] - 30, DS.light[1])) : 0;
  const partsDay = lerp(lerp(DAY0, X.ten, ease(ramp(h, PT.toTen[0], PT.toTen[1]))), X.peak, ease(ramp(h, PT.toPeak[0], PT.toPeak[1])));
  const lightDay = rows.length ? (h < DS.light[0] ? partsDay : lerp(X.peak, rows.length - 1, ease(ramp(h, DS.light[0] + 60, DS.light[1] - 70)))) : 0;
  const ld = Math.min(rows.length - 1, Math.round(lightDay)), lx = M.doc?.extended[ld];             // the readout's morning; the Dial itself glides
  const day = sunUp > 0 && M.doc && rows.length ? X.partsAt(lightDay) : null;                       // the eighteen parts on that morning
  const count = day && h < DS.parts[1] ? { lit: runParts, on: up(PT.run[0] - 40, DS.parts[1], 20), at: day.to, day: day.parts } : undefined;
  // the months on the month wheel: a pointer walks the days; each month's sector lights with its portal
  const monthT = rows.length ? DAY0 + (rows.length - 1 - DAY0) * ramp(h, DS.months[0] + MO.start, DS.months[0] + MO.start + 12 * MO.per) : 0;   // the year, gliding
  const monthAt = h >= DS.months[0] + MO.start && h < DS.months[1] - 20 && rows.length ? rows[Math.min(rows.length - 1, Math.floor(monthT))].month - 1 : -1;
  const monthsOn = up(DS.months[0] + 30, DS.months[1], 25);
  const sea = h >= DS.seasons[0] && h < DS.seasons[1] ? seasonsState(h - DS.seasons[0], X) : null;
  const pri = h >= DS.priests[0] && h < DS.priests[1] ? priestsState(h - DS.priests[0], X) : null;
  // the Dial itself, gliding day by day as the app plays by days: through the year (light, months), week by week (courses)
  const dialT = sunUp > 0 ? lightDay : monthAt >= 0 ? monthT : pri && pri.dialT !== null ? pri.dialT : null;
  const floorPic = useDialAt(M.doc, dialT), partsPic = useDialAt(M.doc, sunUp > 0 ? dialT : null, ['.dl-ring-parts'], true);
  const monthsPic = useDialAt(M.doc, monthAt >= 0 ? dialT : null, ['.dl-ring-position']), coursesPic = useDialAt(M.doc, pri && pri.dialT !== null ? dialT : null, ['.dl-ring-courses']);
  const monthLabel = monthAt >= 0 && X.dayBearing.length ? (() => { const p0 = MONTH_OFF[monthAt], len = monthAt % 3 === 2 ? 31 : 30, b = X.dayBearing[p0 + Math.floor(len / 2)];
    return { m: monthAt, len, at: M.m ? M.m.project(dir(b).multiplyScalar(X.monthR[1] + 13).setY(5), camera) : null }; })() : null;
  const four = up(DS.year[0] + 20, DS.year[1] - 20, 25);
  // the twelve months as days, the four 31st days, the four seasons of 91, and 91 days as 13 weeks
  const mg = X.moonG, moonFlare = (at: number) => (mg ? Math.sin(Math.PI * ramp(g, at - 20, at + 80)) : 0);       // the portal the Moon comes up out of, and the one it goes down into, flare in silver
  const gates = M.state.gates.map((x) => ({
    ...x, cool: mg ? Math.max((x as typeof X.gates[number]).side === 'east' && x.az0 <= mg.riseAz && mg.riseAz <= x.az1 ? moonFlare(mg.rise) : 0, (x as typeof X.gates[number]).side === 'west' && x.az0 <= mg.setAz && mg.setAz <= x.az1 ? moonFlare(mg.set) : 0) : 0,
    glow: (x as typeof X.gates[number]).side === 'east'
      ? Math.max(monthAt >= 0 && monthAt < 12 && SEQ[monthAt] === x.portal ? 1 : 0, [1, 3, 4, 6].includes(x.portal) ? four : 0, sea && sea.flare >= 0 && [6, 4, 1, 3][sea.flare] === x.portal ? sea.flareOn : 0) : 0,
  }));

  useLayoutEffect(() => {
    if (!M.m) return;
    M.heaven?.update(heaven);
    const e = f - E0, windows = e >= 0 ? Array.from({ length: 12 }, (_, k) => ease(ramp(e, 150 + k * 11, 175 + k * 11)) * (1 - ramp(e, 430, 470))) : undefined;
    const lightSun = day ? { dec: day.dec, draw: 1, sunH: sunriseH(X.lat, day.dec) + 2 * Math.PI * runFrac,   // the Sun rises in its portal (which moves along the rim as the date glides), then runs its day
      nightLift: sunUp * ease(ramp(h, 30, 70)), sunGlow: lerp(1, .7, focus),
      bands: { b0: day.rot, r0: DR.day0 / 376 * 100, r1: DR.day1 / 376 * 100, day: day.parts, lit: runParts, on: wheels.parts } } : {};
    M.m.setDial('floor', dialT !== null ? floorPic : null); M.m.setDial('parts', partsPic); M.m.setDial('months', monthsPic); M.m.setDial('courses', coursesPic);
    const dip = (at: number) => Math.min(1, Math.abs(h - at) / 18);
    const floorFade = Math.min(dip(DS.light[1]), dip(DS.months[1] - 20), dip(DS.priests[0]), dip(DS.priests[0] + PB.helix[0]));
    // the Sun's and Moon's paths: full where the light is the subject (the machine's day, the year of light), quiet behind the Dial elsewhere
    const pathGlow = h < 0 ? 1 : sunUp > 0 ? Math.min(Math.max(.25, sunUp), lerp(1, lerp(.5, .28, settled), focus)) : .25 + .75 * (1 - ease(ramp(h, 0, 60)));
    // the Moon and its path leave before the Sun's day on the wheel (the Sun is then the one that moves) and come back with the grid,
    // where the verse is about the Moon rising and setting in the portals
    const moonShow = h < 0 ? 1 - ease(ramp(h, -60, 0)) : ease(ramp(h, DS.grid[0], DS.grid[0] + 60));
    M.m.render({ ...M.state, ...lightSun, moon: M.state.moon ? { ...M.state.moon, on: M.state.moon.on * moonShow } : null, moonGlow: sunUp > 0 ? lerp(1, .25, ease(ramp(h, 0, 60))) : undefined, pathGlow: f >= E0 ? .25 + .75 * ease(ramp(f - E0, 0, 120)) : pathGlow, floorFade: h >= 0 && f < E0 ? floorFade : 1, gates, reveal, camera, wheels: h >= 0 ? wheels : undefined, count, grid3d: h >= 0 ? grid3d : 0, marker, windows, tiles: sea?.tiles ?? pri?.tiles });
  });

  const stage = <Fill><div ref={M.host} style={{ position: 'absolute', inset: 0 }} /></Fill>;
  if (!M.doc || !M.m) return <Fill style={{ background: ink.bg }}>{stage}</Fill>;
  const flash = ramp(f, 160, 186) * (1 - ramp(f, 186, 230));
  return (
    <Fill style={{ background: '#000' }}>
      {stage}
      <Fill style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,.5) 100%)' }} />
      <Fill style={{ background: '#fff4dc', opacity: flash * .92 }} />
      <Fill style={{ background: '#000', opacity: 1 - ramp(f, 0, 30) }} />
      {f >= OFF - 40 && M.overlays(camera, h < 0, false)}
      <Title f={f} />
      <EndOverlays e={f - E0} />
      {pri && <PriestOverlays needle={rows.length && pri.dialT !== null ? lerp(rows[Math.min(rows.length - 2, Math.floor(pri.dialT))].azimuth_deg, rows[Math.min(rows.length - 1, Math.floor(pri.dialT) + 1)].azimuth_deg, pri.dialT % 1) : null} courseR={X.courseRadius} b={h - DS.priests[0]} pri={pri} names={X.courseNames} serving={X.servingAt(pri.dialT ?? 0)} nextYear={X.nextYearCourse} project={(v) => M.m!.project(v, camera)} />}
      {sea && <SeasonOverlays s={h - DS.seasons[0]} sea={sea} project={(v) => M.m!.project(v, camera)} />}
      {day && h < DS.parts[1] && <PartsMarks h={h} day={day} project={(v) => M.m!.project(v, camera)} />}
      {sunUp > 0 && lx && rows[ld] && <LightOverlay o={sunUp * ease(ramp(h, 20, 50))} day={rows[ld].corrected_doy} month={rows[ld].month} dp={lx.day_parts} tp={lx.text_day_parts} />}
      {monthLabel && monthLabel.at && <MonthLabel o={monthsOn} m={monthLabel.m} len={monthLabel.len} at={monthLabel.at} />}
      {h >= 0 && <DialOverlays h={h} monthAt={monthAt} four={four} caught={marker && caughtNow ? { name: X.names[caught], az: caughtNow.az, alt: caughtNow.alt, on: marker.on, screen: M.m.project(marker.pos, camera) } : null} lat={X.lat} gates={X.gates} />}
    </Fill>
  );
}

/** In the house: the book's own title, then the verse that names Uriel as the guide. */
function Title({ f }: { f: number }) {
  const o = ramp(f, 215, 245) * (1 - ramp(f, 315, 335));
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', opacity: o, textShadow: '0 2px 16px rgba(0,0,0,.95)' }}>
      {GEEZ_ON && <div style={{ font: `400 44px ${geez}`, color: ink.gold }}>መጽሐፈ ሚጠተ ብርሃናተ ሰማይ</div>}
      <div style={{ font: `italic 400 38px ${serif}`, color: ink.ivory, marginTop: 12 }}>The book of the courses of the luminaries of the heaven</div>
    </div>
  );
}

/** A camera move that swings round what it looks at (the eye keeps its distance as it turns) instead of cutting across it. */
function orbit(a: Cam, b: Cam, t: number): Cam {
  const va = a.pos.clone().sub(a.look), vb = b.pos.clone().sub(b.look), la = va.length(), lb = vb.length();
  const turn = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(va.clone().normalize(), vb.clone().normalize()), t);
  const look = a.look.clone().lerp(b.look, t);
  return { pos: look.clone().add(va.normalize().applyQuaternion(turn).multiplyScalar(lerp(la, lb, t))), look, up: a.up.clone().lerp(b.up, t).normalize(), fov: lerp(a.fov, b.fov, t) };
}

/** Scene 5's camera: down to the wheel of parts; inside the machine looking east through the grid; above, east at the top. */
function dialCamera(h: number, from: Cam): Cam {
  // the parts scene: in low from the south, the Sun's circle standing over the horizon (day above, night below), then up over the
  // wheel of parts; always from the south, so the Dial stays upright and never turns over
  const circle: Cam = { pos: V(-34, 36, 212), look: V(0, 36, -6), up: V(0, 1, 0), fov: 48 };
  const wheel: Cam = { pos: V(-30, 175, 110), look: V(0, 4, 0), up: V(0, 1, 0), fov: 38 };
  const grid: Cam = { pos: V(-38, 42, 30), look: V(100, 26, -12), up: V(0, 1, 0), fov: 52 };
  const months: Cam = { pos: V(-30, 350, -62), look: V(12, 0, -62), up: V(1, 0, 0), fov: 42 };
  const year: Cam = { pos: V(-60, 500, 0), look: V(16, 0, 0), up: V(1, 0, 0), fov: 42 };
  if (h < DS.light[0]) return orbit(orbit(from, circle, ease(ramp(h, PT.cam[0], PT.cam[1]))), wheel, ease(ramp(h, PT.lift[0], PT.lift[1])));
  if (h < DS.grid[0]) return wheel;                                       // the year of light is watched from where the parts scene ends
  if (h < DS.months[0]) return mix(wheel, grid, ease(ramp(h, DS.grid[0], DS.grid[0] + 80)));
  const seasons: Cam = { pos: V(-170, 300, 0), look: V(14, 0, 0), up: V(1, 0, 0), fov: 44 };
  if (h < DS.seasons[0]) return mix(grid, months, ease(ramp(h, DS.months[0], DS.months[0] + 80)));
  if (h < DS.priests[0]) return mix(months, seasons, ease(ramp(h, DS.seasons[0], DS.seasons[0] + 60)));
  const ring: Cam = { pos: V(-175, 230, 0), look: V(8, 0, 0), up: V(1, 0, 0), fov: 44 };
  const helix: Cam = { pos: V(-150, 150, 175), look: V(0, 26, 0), up: V(0, 1, 0), fov: 44 };
  if (h < DS.year[0]) { const b = h - DS.priests[0]; return b < 740 ? mix(seasons, ring, ease(ramp(b, 180, 300))) : mix(ring, helix, ease(ramp(b, 720, 820))); }
  return mix({ pos: V(-150, 150, 175), look: V(0, 26, 0), up: V(0, 1, 0), fov: 44 }, year, ease(ramp(h, DS.year[0], DS.year[1])));
}

/** Scene 5's words and marks. */
function DialOverlays({ h, monthAt, four, caught, lat, gates }: { h: number; monthAt: number; four: number; lat: number; gates: { az0: number; az1: number; portal: number; side: string }[];
  caught: { name: string | null; az: number; alt: number; on: number; screen: { x: number; y: number } | null } | null }) {
  const D = Math.PI / 180;
  let catchLabel = null;
  if (caught && caught.screen) {
    const sd = Math.sin(lat * D) * Math.sin(caught.alt * D) + Math.cos(lat * D) * Math.cos(caught.alt * D) * Math.cos(caught.az * D);
    const rise = Math.acos(Math.max(-1, Math.min(1, sd / Math.cos(lat * D)))) / D;
    const gate = gates.find((x) => x.side === 'east' && rise >= x.az0 && rise <= x.az1);
    catchLabel = (
      <div style={{ position: 'absolute', top: caught.screen.y - 30, opacity: caught.on, whiteSpace: 'nowrap', textShadow: '0 2px 10px rgba(0,0,0,.9)',
        ...(caught.screen.x > 1200 ? { right: 1920 - caught.screen.x + 40, textAlign: 'right' as const } : { left: caught.screen.x + 40 }) }}>
        {caught.name && <div style={{ font: `italic 400 30px ${serif}`, color: ink.ivory }}>{caught.name}</div>}
        <div style={{ font: `400 15px ${mono}`, color: ink.goldHi, letterSpacing: '.12em' }}>{gate ? <>ROSE IN PORTAL <span style={{ font: `400 20px ${GEEZ_ON ? geez : serif}` }}>{num(gate.portal)}</span> · </> : null}ALTITUDE {caught.alt.toFixed(0)}° · BEARING {caught.az.toFixed(0)}°</div>
      </div>
    );
  }
  return (
    <>
      {catchLabel}
      {four > 0 && (
        <div style={{ position: 'absolute', left: 110, top: 300, textAlign: 'left', opacity: ramp(h, DS.year[0] + 120, DS.year[0] + 160) }}>
          <div style={{ font: `300 96px ${mono}`, color: ink.goldHi, textShadow: '0 0 30px rgba(244,220,159,.5)' }}>364</div>
          <div style={{ font: `400 14px ${cond}`, color: ink.ivory2, letterSpacing: '.3em' }}>DAYS · THE YEAR COMPLETE</div>
        </div>
      )}
    </>
  );
}

/** The ending's camera: down into the machine before the great portal; then up and away. */
function endCamera(e: number, from: Cam): Cam {
  const g = dir(80).multiplyScalar(100);
  const portal: Cam = { pos: dir(80).multiplyScalar(52).add(V(0, 11, 0)), look: g.clone().setY(9), up: V(0, 1, 0), fov: 44 };
  const away: Cam = { pos: V(-320, 920, 140), look: V(0, 0, 0), up: V(1, 0, 0), fov: 46 };
  return e < 300 ? mix(from, portal, ease(ramp(e, 0, 150))) : mix(portal, away, ease(ramp(e, 300, 450)));
}

/** The ending's words, the fall into darkness, and the title. */
function EndOverlays({ e }: { e: number }) {
  if (e < 0) return null;
  const dark = ramp(e, 400, 450), title = ramp(e, 440, 480);
  return (
    <>
      <Fill style={{ background: '#000', opacity: dark }} />
      {title > 0 && (
        <Fill style={{ display: 'grid', placeItems: 'center', opacity: title }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ font: `italic 400 44px ${serif}`, color: ink.ivory }}>The book of the courses of the luminaries of the heaven</div>
            <div style={{ font: `400 14px ${mono}`, color: ink.ivory3, marginTop: 16, letterSpacing: '.24em' }}>1 ENOCH 72–82</div>
          </div>
        </Fill>
      )}
    </>
  );
}

// ---- the months and the seasons
const ELEVEN = [90, 181, 272, 363];                           // the four 31st days (positions 91, 182, 273, 364)
const TURNS = [
  { day: 91, portal: 6, lines: ['THE SUN TURNS IN THE SIXTH PORTAL', 'THE LONGEST DAY · SUMMER BEGINS'] },
  { day: 182, portal: 4, lines: ['THE SUN RISES DUE EAST IN THE FOURTH PORTAL', 'DAY AND NIGHT EQUAL · AUTUMN BEGINS'] },
  { day: 273, portal: 1, lines: ['THE SUN TURNS IN THE FIRST PORTAL', 'THE SHORTEST DAY · WINTER BEGINS'] },
  { day: 364, portal: 3, lines: ['THE SUN COMES BACK TO DUE EAST', 'DAY AND NIGHT EQUAL · SPRING BEGINS'] },
];
const SEASONS = [
  { name: 'SPRING', from: 'from day and night equal to the longest day' }, { name: 'SUMMER', from: 'from the longest day to day and night equal' },
  { name: 'AUTUMN', from: 'from day and night equal to the shortest day' }, { name: 'WINTER', from: 'from the shortest day to day and night equal' },
];
type SeasonState = ReturnType<typeof seasonsState>;

/** The year laid out as 364 tiles over the Dial's month wheel, each over its own day; the four 31st days lit in turn
 *  with their portals; the four quarters parted; then the first 91 days gathered into 13 sevens. */
function seasonsState(s: number, X: { dayBearing: number[]; monthRadius: number }) {
  const n = 364, pos = new Float32Array(n * 3), rot = new Float32Array(n), col = new Float32Array(n * 3), size = new Float32Array(n);
  const lift = ease(ramp(s, SA.lay[0], SA.lay[0] + 60)), split = ease(ramp(s, SA.split[0], SA.split[0] + 80)), gather = ease(ramp(s, SA.gather[0], SA.gather[0] + 90));
  const flare = s >= SA.turns[0] && s < SA.turns[1] ? Math.floor((s - SA.turns[0]) / 75) : -1;
  const flareOn = flare >= 0 ? Math.sin(Math.PI * ((s - SA.turns[0]) % 75) / 75) : 0;
  const R = X.monthRadius + 2, D = Math.PI / 180;
  for (let p = 0; p < n; p++) {
    const b = X.dayBearing[p] ?? 0, q = Math.floor(p / 91), m = Math.min(11, Math.floor(p / 91) * 3 + (p % 91 < 30 ? 0 : p % 91 < 60 ? 1 : 2));
    const seasonMid = X.dayBearing[q * 91 + 45] ?? 0, k = ELEVEN.indexOf(p), lit = k >= 0 && k === flare ? flareOn : 0, done = k >= 0 && (k < flare || s >= SA.turns[1]) ? 1 : 0;
    let x = Math.sin(b * D) * R + Math.sin(seasonMid * D) * 16 * split, z = -Math.cos(b * D) * R - Math.cos(seasonMid * D) * 16 * split, y = 1 + 5 * lift + 12 * lit + 3 * done;
    let r = -b * D;
    if (q === 0 && gather > 0) {                                          // the first quarter gathers into 13 columns of 7
      const c = Math.floor(p / 7), w = p % 7, tx = 26 - w * 5.6, tz = (c - 6) * 5.6, ty = 34;
      x += (tx - x) * gather; y += (ty - y) * gather; z += (tz - z) * gather; r *= 1 - gather;
    }
    pos.set([x, y, z], p * 3); rot[p] = r;
    const base = m % 2 ? [.62, .42, .22] : [.86, .62, .30], gold = [1.25, .98, .52], hot = [2.6, 2.1, 1.1];
    const c = k >= 0 ? (lit > 0 ? gold.map((v, i) => v + (hot[i] - v) * lit) : done ? gold : base) : base;
    col.set(c, p * 3);
    const appear = ramp(s, SA.lay[0] + p * (180 / n), SA.lay[0] + p * (180 / n) + 12);
    size[p] = appear * (q === 0 ? 1 : 1 - gather) * (1 + 2.2 * lit + .5 * done) * (1 + .5 * gather * (q === 0 ? 1 : 0));
  }
  return { tiles: { pos, rot, col, size }, flare, flareOn, split, gather, lift, R };
}

function SeasonOverlays({ s, sea, project }: { s: number; sea: SeasonState; project: (v: THREE.Vector3) => { x: number; y: number } | null }) {
  const P = (k: number) => new THREE.Vector3(sea.tiles.pos[k * 3], sea.tiles.pos[k * 3 + 1], sea.tiles.pos[k * 3 + 2]);
  const monthsOn = ramp(s, SA.lay[0] + 60, SA.lay[0] + 100) * (1 - ramp(s, SA.turns[0] - 20, SA.turns[0]));
  const turn = sea.flare >= 0 && sea.flare < 4 ? TURNS[sea.flare] : null, tp = turn ? project(P(ELEVEN[sea.flare]).clone().setY(P(ELEVEN[sea.flare]).y + 8)) : null;
  const splitOn = ramp(s, SA.split[0] + 60, SA.split[0] + 100) * (1 - ramp(s, SA.gather[0], SA.gather[0] + 30));
  const gatherOn = ramp(s, SA.gather[0] + 70, SA.gather[0] + 100);
  return (
    <>
      {monthsOn > 0 && Array.from({ length: 12 }, (_, m) => {
        const q = Math.floor(m / 3), first = q * 91 + [0, 30, 60][m % 3], len = m % 3 === 2 ? 31 : 30, mid = P(first + Math.floor(len / 2)), at = project(mid.clone().multiplyScalar(1.22).setY(mid.y));
        return at ? (
          <div key={m} style={{ position: 'absolute', left: at.x, top: at.y, transform: 'translate(-50%,-50%)', textAlign: 'center', opacity: monthsOn, textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
            <div style={{ font: `300 24px ${mono}`, color: ink.ivory }}>{m + 1}</div>
            <div style={{ font: `400 13px ${mono}`, color: len === 31 ? ink.goldHi : ink.ivory2, letterSpacing: '.1em' }}>{len} DAYS</div>
          </div>) : null;
      })}
      {turn && tp && sea.flareOn > .05 && (
        <div style={{ position: 'absolute', left: tp.x, top: tp.y, transform: 'translate(-50%,-100%)', textAlign: 'center', opacity: Math.min(1, sea.flareOn * 1.6), whiteSpace: 'nowrap', textShadow: '0 2px 12px rgba(0,0,0,.95)' }}>
          <div style={{ font: `300 30px ${mono}`, color: ink.goldHi }}>DAY {turn.day}</div>
          <div style={{ font: `400 13px ${mono}`, color: ink.ivory, letterSpacing: '.14em', marginTop: 4 }}>{turn.lines[0]}</div>
          <div style={{ font: `400 13px ${mono}`, color: ink.goldHi, letterSpacing: '.14em', marginTop: 2 }}>{turn.lines[1]}</div>
        </div>
      )}
      {splitOn > 0 && SEASONS.map((x, q) => {
        const mid = P(q * 91 + 45), at = project(mid.clone().multiplyScalar(1.45).setY(mid.y));
        return at ? (
          <div key={q} style={{ position: 'absolute', left: at.x, top: Math.min(at.y, 760), transform: 'translate(-50%,-50%)', textAlign: 'center', opacity: splitOn, whiteSpace: 'nowrap', textShadow: '0 2px 12px rgba(0,0,0,.95)' }}>
            <div style={{ font: `400 15px ${cond}`, color: ink.goldHi, letterSpacing: '.3em' }}>{x.name}</div>
            <div style={{ font: `300 30px ${mono}`, color: ink.ivory }}>91 DAYS</div>
            <div style={{ font: `italic 400 19px ${serif}`, color: ink.ivory2 }}>{x.from}</div>
          </div>) : null;
      })}
      {gatherOn > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', opacity: gatherOn, textShadow: '0 2px 12px rgba(0,0,0,.95)' }}>
          <div style={{ font: `300 46px ${mono}`, color: ink.goldHi }}>91 DAYS = 13 WEEKS</div>
          <div style={{ font: `400 14px ${cond}`, color: ink.ivory2, letterSpacing: '.3em', marginTop: 6 }}>THIRTEEN SEVENS · EVERY SEASON THE SAME</div>
        </div>
      )}
    </>
  );
}

// ---- the week and the 24 courses
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SABBATH'];
type PriestState = ReturnType<typeof priestsState>;

/** One week of seven (the seventh the Sabbath); the week becomes one course; the 24 courses around the Dial's course
 *  wheel in the clock's (Qumran) order, served one a week; a year of 52 weeks runs the wheel twice and four more; six
 *  years of 312 weeks rise as a helix of 13 turns and come home to Gamul. */
function priestsState(b: number, X: { courseBearing: number[]; courseBearing0: number[]; course0: number; courseRadius: number; courseDayRadius: number }) {
  const n = 364, pos = new Float32Array(n * 3), rot = new Float32Array(n), col = new Float32Array(n * 3), size = new Float32Array(n);
  const D = Math.PI / 180, Rc = X.courseRadius + 4, onRing = (k: number, y: number) => [Math.sin(X.courseBearing[k] * D) * Rc, y, -Math.cos(X.courseBearing[k] * D) * Rc] as const;
  const merge = ease(ramp(b, 170, 230));
  // the Dial glides on from the year's first morning, week 1 to week 52, as one move that eases in and out (so the count never
  // jumps ahead): once round the 24 courses, round again, and four more; its own gold course and lit day cell show who serves
  // (null: the Dial at rest)
  const helixOn = b >= PB.helix[0];
  const dialT = b < PB.ring[0] + 60 ? 0 : helixOn ? null : 363 * ease(ramp(b, PB.ring[0] + 60, PB.year[0] + 140));
  const yearWeek = b >= PB.ring[0] + 60 && !helixOn ? Math.min(52, Math.floor((dialT ?? 0) / 7) + 1) : -1;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0, r = 0, c = [.86, .62, .30], z0 = 0;
    if (!helixOn && i < 91) {                                               // the 13 sevens from the seasons, then one week alone
      const blockX = 26 - (i % 7) * 5.6, blockZ = (Math.floor(i / 7) - 6) * 5.6, inWeek = i < 7;
      const tx = 12, tz = (i - 3) * 11, w = inWeek ? ease(ramp(b, 20, 90)) : 0;
      x = blockX + (tx - blockX) * w; y = 34; z = blockZ + (tz - blockZ) * w;
      if (inWeek) {                                                         // into the serving course's seven day cells on the course wheel
        const cb = (X.courseBearing0[X.course0] + (.5 - (i + .5) / 7) * 15) * D, gx = Math.sin(cb) * X.courseDayRadius, gz = -Math.cos(cb) * X.courseDayRadius;
        x += (gx - x) * merge; y += (4.5 - y) * merge; z += (gz - z) * merge; r = -cb * merge;
      }
      c = inWeek && i === 6 ? [.95, 1.0, 1.3] : [.86, .62, .30];
      z0 = inWeek ? (1 - ramp(b, 280, 320)) * (1 + 1.2 * ramp(b, 20, 90) * (1 - .55 * merge)) : 1 - ramp(b, 0, 40);
    } else if (helixOn && i < 312) {                                        // six years: 312 weeks, 13 turns of 24
      const k = i % 24, turn = Math.floor(i / 24), yr = Math.floor(i / 52), [px, , pz] = onRing(k, 0);
      x = px; z = pz; y = 3 + turn * 4.4; r = -X.courseBearing[k] * D;
      c = i % 52 === 0 ? [2.4, 2.0, 1.05] : yr % 2 ? [.55, .40, .22] : [.9, .66, .32];
      z0 = (HELIX_HEADS_ONLY && i % 52 ? 0 : 1) * ramp(b, PB.helix[0] + 20 + i * .45, PB.helix[0] + 34 + i * .45) * (i % 52 === 0 ? 2.0 : 1.25);
    }
    pos.set([x, y, z], i * 3); rot[i] = r; col.set(c, i * 3); size[i] = z0;
  }
  return { tiles: { pos, rot, col, size }, dialT, yearWeek, helixOn, onRing, merge };
}

function PriestOverlays({ needle, courseR, b, pri, names, serving, nextYear, project }: { needle: number | null; courseR: number; b: number; pri: PriestState; names: string[]; serving: string; nextYear: string; project: (v: THREE.Vector3) => { x: number; y: number } | null }) {
  const at = (k: number, y: number, out = 1.32) => { const [x, , z] = pri.onRing(k, 0); return project(new THREE.Vector3(x * out, y, z * out)); };
  const week = ramp(b, 60, 100) * (1 - ramp(b, 280, 310));
  const ringOn = ramp(b, 250, 290) * (1 - ramp(b, PB.helix[0] - 20, PB.helix[0] + 10));
  const yearText = pri.yearWeek >= 0 ? pri.yearWeek : -1;
  const hover = needle !== null && b >= 250 ? project(dir(needle).multiplyScalar(courseR).setY(16)) : null;
  return (
    <>
      {week > 0 && DAYS.map((d, i) => {
        const tx = pri.tiles.pos[i * 3], tz = pri.tiles.pos[i * 3 + 2], rr = Math.hypot(tx, tz) || 1, m = pri.merge;
        const p = project(new THREE.Vector3(tx - 6 * (1 - m) + (tx / rr) * 7 * m, pri.tiles.pos[i * 3 + 1], tz + (tz / rr) * 7 * m));
        return p ? <div key={d} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,0)', opacity: week * (i === 6 ? 1 : 1 - pri.merge), font: `400 ${i === 6 ? 17 : 14}px ${mono}`, color: i === 6 ? '#e6eeff' : ink.ivory2, letterSpacing: '.16em', textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>{d}</div> : null;
      })}
      {hover && ringOn > 0 && (
        <div style={{ position: 'absolute', left: hover.x, top: hover.y, transform: 'translate(-50%,-100%)', opacity: ringOn, textAlign: 'center', whiteSpace: 'nowrap', textShadow: '0 2px 14px rgba(0,0,0,.95)' }}>
          <div style={{ font: `italic 400 34px ${serif}`, color: '#fff3dc' }}>{serving}</div>
          <div style={{ width: 1, height: 26, background: 'rgba(244,220,159,.6)', margin: '4px auto 0' }} />
        </div>
      )}
      {ringOn > 0 && b >= 270 && b < PB.year[0] && (
        <div style={{ position: 'absolute', right: 96, top: 190, textAlign: 'right', opacity: ringOn * (1 - ramp(b, 440, 480)) }}>
          <div style={{ font: `400 13px ${cond}`, color: ink.ivory3, letterSpacing: '.28em' }}>THE 24 COURSES</div>
          <div style={{ font: `italic 400 20px ${serif}`, color: ink.ivory2, marginTop: 6 }}>one serves each week, in the order kept at Qumran</div>

        </div>
      )}
      {yearText >= 0 && (
        <div style={{ position: 'absolute', right: 96, top: 70, textAlign: 'right', opacity: ramp(b, PB.ring[0] + 60, PB.ring[0] + 100) }}>
          <div style={{ font: `400 13px ${cond}`, color: ink.ivory3, letterSpacing: '.28em' }}>ONE YEAR</div>
          <div style={{ font: `300 46px ${mono}`, color: ink.goldHi }}>WEEK {yearText} <span style={{ color: ink.ivory3 }}>OF 52</span></div>
          <div style={{ font: `400 15px ${mono}`, color: ink.ivory2, letterSpacing: '.12em', marginTop: 4, opacity: ramp(yearText, 24, 26) }}>52 WEEKS = 24 + 24 + 4</div>
          {yearText >= 52 && <div style={{ font: `italic 400 24px ${serif}`, color: ink.ivory, marginTop: 10 }}>so the next year begins with {nextYear}</div>}
        </div>
      )}
      {pri.helixOn && [0, 1, 2, 3, 4, 5].map((yr) => {
        const w = yr * 52, k = w % 24, turn = Math.floor(w / 24), p = at(k, 3 + turn * 4.4, 1.18);
        return p ? <div key={yr} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', opacity: ramp(b, PB.helix[0] + 30 + w * .45, PB.helix[0] + 60 + w * .45), whiteSpace: 'nowrap', textShadow: '0 2px 10px rgba(0,0,0,.95)', textAlign: 'center' }}>
          <div style={{ font: `400 12px ${mono}`, color: ink.goldHi, letterSpacing: '.16em' }}>YEAR {yr + 1}</div>
          <div style={{ font: `italic 400 20px ${serif}`, color: ink.ivory }}>{names[k]}</div>
        </div> : null;
      })}
      {pri.helixOn && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 60, textAlign: 'center', opacity: ramp(b, PB.helix[0] + 200, PB.helix[0] + 240), textShadow: '0 2px 12px rgba(0,0,0,.95)' }}>
          <div style={{ font: `300 42px ${mono}`, color: ink.goldHi }}>6 YEARS · 312 WEEKS · 13 TURNS</div>
          <div style={{ font: `italic 400 24px ${serif}`, color: ink.ivory, marginTop: 6 }}>and Gamul serves first again</div>
        </div>
      )}
    </>
  );
}

const SEASON_OF = (doy: number) => [
  ['SPRING', 'from day and night equal toward the longest day'], ['SUMMER', 'from the longest day toward day and night equal'],
  ['AUTUMN', 'from day and night equal toward the shortest day'], ['WINTER', 'from the shortest day toward day and night equal'],
][Math.min(3, Math.floor((doy - 1) / 91))];

/** The light through the year: day, season, and the parts of light and darkness, measured and as Enoch gives them. */
function LightOverlay({ o, day, month, dp, tp }: { o: number; day: number; month: number; dp: number; tp: number }) {
  const [name, words] = SEASON_OF(day);
  return (
    <div style={{ position: 'absolute', left: 96, top: 64, textAlign: 'left', opacity: o, textShadow: '0 2px 12px rgba(0,0,0,.95)' }}>
      <div style={{ font: `400 13px ${cond}`, color: ink.ivory3, letterSpacing: '.28em' }}>DAY {day} OF 364 · MONTH {month}</div>
      <div style={{ font: `400 18px ${cond}`, color: ink.goldHi, letterSpacing: '.3em', marginTop: 10 }}>{name}</div>
      <div style={{ font: `italic 400 20px ${serif}`, color: ink.ivory2 }}>{words}</div>
      <div style={{ font: `400 13px ${cond}`, color: ink.ivory3, letterSpacing: '.28em', marginTop: 22 }}>LIGHT · DARKNESS</div>
      <div style={{ font: `300 46px ${mono}`, color: ink.goldHi }}>{dp.toFixed(1)} <span style={{ color: ink.ivory3 }}>:</span> <span style={{ color: '#8fa3c8' }}>{(18 - dp).toFixed(1)}</span></div>
      <div style={{ font: `400 14px ${mono}`, color: ink.bronze, letterSpacing: '.1em' }}>ENOCH {tp.toFixed(1)} : {(18 - tp).toFixed(1)}</div>
      <div style={{ font: `400 12px ${mono}`, color: ink.ivory3, letterSpacing: '.12em', marginTop: 4 }}>OF EIGHTEEN PARTS</div>
    </div>
  );
}

/** The parts scene's words: once the Sun has run its day and the wheel has counted it, how much of the eighteen is light and how
 *  much is night, set on the gold and the blue of the wheel. */
function PartsMarks({ h, day, project }: { h: number; day: { rot: number; parts: number }; project: (v: THREE.Vector3) => { x: number; y: number } | null }) {
  const ring = ease(ramp(h, PT.run[1] - 10, PT.run[1] + 30)) * (1 - ease(ramp(h, DS.parts[1] - 30, DS.parts[1])));
  const dayB = day.rot + day.parts * 10, nightB = day.rot + day.parts * 20 + (18 - day.parts) * 10, R = 60;
  const at = (b: number) => V(Math.sin(b * Math.PI / 180) * R, 4, -Math.cos(b * Math.PI / 180) * R);
  const n = (x: number) => (Math.abs(x - Math.round(x)) < .05 ? String(Math.round(x)) : x.toFixed(1));
  const mark = (p: { x: number; y: number } | null, o: number, big: string, small: string, col: string) => p && o > .01 && (
    <div style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', opacity: o, textAlign: 'center', textShadow: '0 2px 14px rgba(0,0,0,.95)' }}>
      <div style={{ font: `300 70px ${mono}`, color: col, lineHeight: 1 }}>{big}</div>
      <div style={{ font: `400 14px ${cond}`, color: col, letterSpacing: '.3em', marginTop: 6 }}>{small}</div>
    </div>);
  return (
    <>
      {mark(project(at(dayB)), ring, n(day.parts), 'PARTS OF LIGHT', ink.goldHi)}
      {mark(project(at(nightB)), ring, n(18 - day.parts), 'PARTS OF DARKNESS', '#8fa3c8')}
    </>
  );
}

/** The month the pointer is in, beside its sector on the wheel. */
function MonthLabel({ o, m, len }: { o: number; m: number; len: number; at: { x: number; y: number } }) {
  return (
    <div style={{ position: 'absolute', left: 96, top: 64, opacity: o, whiteSpace: 'nowrap', textShadow: '0 2px 12px rgba(0,0,0,.95)' }}>
      <div style={{ font: `400 14px ${cond}`, color: ink.ivory3, letterSpacing: '.28em' }}>MONTH</div>
      <div style={{ font: `300 64px ${mono}`, color: ink.ivory, lineHeight: 1 }}>{m + 1}</div>
      <div style={{ font: `400 14px ${cond}`, color: ink.ivory3, letterSpacing: '.28em', marginTop: 16 }}>RISES IN PORTAL</div>
      <div style={{ font: `300 64px ${mono}`, color: ink.goldHi, lineHeight: 1 }}>{SEQ[m]}</div>
      <div style={{ font: `400 16px ${mono}`, color: len === 31 ? ink.goldHi : ink.ivory2, letterSpacing: '.14em', marginTop: 16 }}>{len} DAYS{len === 31 ? ' · ON ACCOUNT OF ITS SIGN' : ''}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>{SEQ.map((p, k) => <span key={k} style={{ font: `400 18px ${mono}`, color: k === m ? '#fff3dc' : k < m ? ink.gold : ink.ivory3, opacity: k <= m ? 1 : .5 }}>{p}</span>)}</div>
    </div>
  );
}

/** The verse on screen at frame f (the burned-in version), from the shared cues. */
