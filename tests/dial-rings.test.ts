// The Dial's rings as a tap finds them (src/dial/render.ts hitBand, DR): each ring has its band; the week's beads belong to the courses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DR, hitBand } from '../src/dial/render';

test('a tap at each ring\'s middle radius selects that ring', () => {
  const mid: [string, number][] = [['compass', 60], ['parts', (DR.pt0 + DR.pt1) / 2], ['courses', DR.bead], ['courses', (DR.crs0 + DR.crs1) / 2], ['correction', (DR.cor0 + DR.cor1) / 2],
    ['position', (DR.mo0 + DR.mo1) / 2], ['uncorrected', (DR.um0 + DR.um1) / 2], ['bearing', DR.band0 + 5], ['sky', (DR.horizon + DR.band1) / 2]];
  for (const [key, r] of mid) for (const a of [0, 1.3, 4]) assert.equal(hitBand(r * Math.sin(a), -r * Math.cos(a)), key, `r = ${r} at ${a} rad`);
  assert.equal(hitBand(0, DR.band1 + 30), null);                      // off the face
});
test('the week\'s beads lie between the parts and the courses\' cells, and the rings do not overlap', () => {
  assert.ok(DR.pt1 < DR.bead && DR.bead < DR.crs0 && DR.crs0 < DR.crs1 && DR.crs1 < DR.cor0);
  let last = hitBand(0, -1);
  const order = [last];
  for (let r = 1; r < DR.band1; r += 0.5) { const k = hitBand(0, -r); if (k !== last && k) { order.push(k); last = k; } else if (k !== last) last = k; }
  assert.deepEqual(order, ['compass', 'parts', 'courses', 'correction', 'position', 'uncorrected', 'bearing', 'sky']);   // each once, in this order from the centre
});
