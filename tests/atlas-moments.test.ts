// Moments (src/atlas/moments.ts): what is kept, the link, export and import, and the tag filter shared with the places.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanMoment, exportJson, filterItems, importJson, isoAt, jdAt, merge, momentLink, readTags, type Moment } from '../src/atlas/moments.ts';

const qumran = { name: 'Qumran', lat: 31.7414, lon: 35.4593, elev: -300, tz: 'Asia/Jerusalem' };
const m = (o: Partial<Moment>): Moment => ({ id: 'a', name: 'Day 1 at Qumran', desc: '', color: '#d6b26a', tags: ['Enoch'], place: qumran, at: '2026-03-21T03:52:10.000Z', saved: '2026-10-29T00:00:00.000Z', ...o });

test('an instant is kept to the second, in any era', () => {
  for (const jd of [2461120.6612, 1721057.5, -2000000.25]) assert.ok(Math.abs(jdAt(isoAt(jd)) - jd) < 1 / 86400, `${jd}`);
  assert.match(isoAt(-2000000.25), /^-\d{6}-/);
});

test('the link carries the place and the instant, either alone, and opens Atlas', () => {
  const link = momentLink(m({}), 'https://enochclock.com/'), u = new URL(link);
  assert.equal(u.hash, '#atlas');
  assert.deepEqual(Object.fromEntries(u.searchParams), { lat: '31.7414', lon: '35.4593', elev: '-300', tz: 'Asia/Jerusalem', name: 'Qumran', at: '2026-03-21T03:52:10.000Z' });
  assert.deepEqual([...new URL(momentLink(m({ at: null }), 'https://x/')).searchParams.keys()], ['lat', 'lon', 'elev', 'tz', 'name']);
  assert.deepEqual([...new URL(momentLink(m({ place: null }), 'https://x/')).searchParams.keys()], ['at']);
});

test('a moment from storage or a file is checked: a place in range or an instant, a colour, tags without repeats', () => {
  assert.equal(cleanMoment({ name: 'nothing' }), null);
  assert.equal(cleanMoment({ place: { lat: 95, lon: 0 } }), null);
  assert.equal(cleanMoment('x'), null);
  const c = cleanMoment({ place: { lat: 10, lon: 20 }, color: 'red', tags: ['a', ' a ', 3, ''], name: '' })!;
  assert.deepEqual([c.color, c.tags, c.name, c.place!.tz, c.at], ['#d6b26a', ['a'], 'Moment', 'UTC', null]);
  assert.ok(c.id);
  assert.deepEqual(readTags('solstice, history,, solstice , Enoch'), ['solstice', 'history', 'Enoch']);
});

test('export and import round-trip; a bare list is read too; the same id replaces', () => {
  const list = [m({}), m({ id: 'b', place: null, name: 'An instant' })];
  const back = importJson(exportJson(list));
  assert.deepEqual(back, { moments: list, skipped: 0 });
  assert.equal(importJson(JSON.stringify([...list, { junk: 1 }])).skipped, 1);
  assert.throws(() => importJson('{"kind":"other"}'));
  const merged = merge(list, [m({ name: 'renamed' }), m({ id: 'c' })]);
  assert.deepEqual(merged.map((x) => [x.id, x.name]), [['a', 'renamed'], ['c', 'Day 1 at Qumran'], ['b', 'An instant']]);
});

test('the filter: every chosen tag, and every word of the search in the name, note or region', () => {
  const items = [{ name: 'Qumran', tags: ['Enoch', 'scripture'], desc: 'the scrolls', region: 'West Bank' }, { name: 'Newgrange', tags: ['alignment'], region: 'Ireland' }];
  assert.deepEqual(filterItems(items, new Set(['Enoch']), '').map((x) => x.name), ['Qumran']);
  assert.deepEqual(filterItems(items, new Set(), 'ireland').map((x) => x.name), ['Newgrange']);
  assert.deepEqual(filterItems(items, new Set(), 'west scrolls').map((x) => x.name), ['Qumran']);
  assert.deepEqual(filterItems(items, new Set(['Enoch', 'alignment']), ''), []);
});
