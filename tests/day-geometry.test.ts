// The Day's arrangement (tall: the sky over the dial; wide: beside it) and the Sky's view (the horizon and the Sun both in it).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { geometryFor, SPAN_MAX, SPAN_MIN, viewFor, zoomRange, ZOOM_MAX, ZOOM_MIN } from '../src/day/geometry.ts';

test('a tall screen puts the sky over the dial, the dial no wider than the screen allows and its top in view', () => {
  for (const [w, h, top] of [[390, 640, 60], [768, 900, 70], [540, 960, 0]]) {
    const g = geometryFor(w, h, top), dialTop = g.dial.cy - g.dial.d / 2;
    assert.equal(g.side, false, `${w}×${h}`);
    assert.ok(dialTop >= g.sky.y + g.sky.h, 'the dial starts under the sky');
    assert.ok(dialTop < h - g.foot.h, 'the top of the face shows above the captions');
    assert.ok(g.dial.d <= w * 1.04 + 1e-9);
    assert.equal(g.dial.cx, w / 2, 'the dial is centred under the sky');
  }
});

test('a wide screen puts the dial whole at the right, the sky to its left reaching it', () => {
  for (const [w, h, top] of [[1060, 740, 60], [1920, 1000, 70], [844, 390, 50]]) {
    const g = geometryFor(w, h, top), d = g.dial;
    assert.equal(g.side, true, `${w}×${h}`);
    assert.ok(d.cx + d.d / 2 <= w && d.cy - d.d / 2 >= top && d.cy + d.d / 2 <= h, 'the face is whole, under the options');
    assert.ok(g.sky.x + g.sky.w >= d.cx - d.d / 2, 'the sky reaches the face');
    assert.ok(g.foot.w === g.sky.w, 'the captions sit under the sky');
  }
});

test("the Sky's view holds the horizon and the Sun, with room beyond the Sun, at every altitude", () => {
  for (let alt = -90; alt <= 90; alt += 5) {
    const v = viewFor(alt), lo = v.mid - v.span / 2, hi = v.mid + v.span / 2;
    assert.ok(lo < 0 && hi > 0, `horizon in view (Sun at ${alt}°)`);
    assert.ok(alt - lo >= 14 && hi - alt >= 14, `Sun in view with room (Sun at ${alt}°: ${lo.toFixed(1)}…${hi.toFixed(1)})`);
    assert.ok(v.span >= 70);
  }
});

test('zoomed while following: closer as k grows, the Sun always in view, within the limits', () => {
  for (let alt = -90; alt <= 90; alt += 10) {
    const [lo, hi] = zoomRange(alt);
    assert.ok(lo >= ZOOM_MIN && lo <= 1 && hi <= ZOOM_MAX && hi >= 1, `range at ${alt}°: ${lo}…${hi}`);
    let last = Infinity;
    for (let k = lo; k <= hi + 1e-9; k *= 1.25) {
      const v = viewFor(alt, k), a = v.mid - v.span / 2, b = v.mid + v.span / 2;
      assert.ok(alt > a && alt < b, `Sun in view (Sun at ${alt}°, ${k.toFixed(2)}×)`);
      assert.ok(v.span >= SPAN_MIN - 1e-9 && v.span <= SPAN_MAX + 1e-9);
      assert.ok(v.span <= last + 1e-9, 'never wider as it zooms in'); last = v.span;
    }
  }
  assert.deepEqual(viewFor(30, 1), viewFor(30), '1× is the automatic view');
});
