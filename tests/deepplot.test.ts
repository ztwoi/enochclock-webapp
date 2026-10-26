// Deep Time's plot arithmetic: bins are exact, the range stays on the axis, ticks are round.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AXIS, binsIn, binWidth, clampDays, clampRange, clipX, DAYS, dayText, dayTicks, niceStep, yearTicks, yearText, zoomDays, zoomRange, type DeepSeries } from '../src/deepplot.ts';

// a synthetic series over the dataset's real span: a slow wave plus a yearly sawtooth
const first = -12998, last = 16996, n = last - first + 1;
const series: DeepSeries = { first_year: first, last_year: last, precision_days: 1e-6,
  enoch: Array.from({ length: n }, (_, i) => Math.sin(i / 3000) + ((i * 7) % 33) / 33),
  greg: Array.from({ length: n }, (_, i) => Math.cos(i / 4000) - (i % 4) * 0.24) };

test('bins are the exact min, mean and max of the years they hold', () => {
  for (const w of [1, 10, 100]) {
    const bins = binsIn(series, 1800, 2300, w);
    for (const b of bins) {
      const v = series.enoch.slice(b.year - first, b.year - first + w);
      assert.equal(b.n, v.length);
      assert.deepEqual(b.enoch, [Math.min(...v), v.reduce((s, x) => s + x, 0) / v.length, Math.max(...v)]);
    }
    assert.ok(bins[0].year <= 1800 && bins.at(-1)!.year + w > 2300, `width ${w} covers the range`);
  }
});

test('all 30,000 years in 100-year bins, aligned to multiples of the bin width, every year once', () => {
  const bins = binsIn(series, AXIS.A, AXIS.B, 100);
  assert.equal(binWidth(AXIS.B - AXIS.A), 100);
  assert.equal(bins[0].year, -13000);
  assert.equal(bins[0].n, 98);                                   // -12998 … -12901
  assert.equal(bins.reduce((s, b) => s + b.n, 0), n);
  assert.ok(bins.every((b) => b.year % 100 === 0));
});

test('the bin width narrows with the range, to single years', () => {
  assert.deepEqual([30000, 3000, 1000, 300, 100, 20].map(binWidth), [100, 10, 5, 1, 1, 1]);
});

test('zoom keeps the year under the pointer in place and the range on the axis', () => {
  const [a, b] = zoomRange(AXIS.A, AXIS.B, 10, 2026), t0 = (2026 - AXIS.A) / (AXIS.B - AXIS.A);
  assert.ok(Math.abs(b - a - 3000) < 1e-9);
  assert.ok(Math.abs((2026 - a) / (b - a) - t0) < 1e-12);
  assert.deepEqual(zoomRange(AXIS.A, AXIS.B, 0.5, 0), [AXIS.A, AXIS.B]);           // never wider than the axis
  assert.ok(zoomRange(2000, 2030, 100, 2015)[1] - zoomRange(2000, 2030, 100, 2015)[0] >= AXIS.MIN_SPAN - 1e-9);
  assert.deepEqual(clampRange(16000, 18000), [15000, 17000]);
  assert.deepEqual(clampRange(-14000, -12000), [-13000, -11000]);
});

test('ticks are round: every 5,000 years for the whole axis, single years when close', () => {
  const t = yearTicks(AXIS.A, AXIS.B);
  assert.equal(t.step, 5000);
  assert.deepEqual(t.major, [-10000, -5000, 0, 5000, 10000, 15000]);
  assert.equal(t.minor.length, 31 - 6);                          // every 1,000 from −13000 to +17000, less the labelled ones
  assert.equal(niceStep(20, 6), 5);
  assert.equal(niceStep(5, 6), 1);
  assert.deepEqual([yearText(5000, true), yearText(-10000, true), yearText(0, true), yearText(2026, false)], ['+5000', '−10000', '0', '2026']);
});

test('a polyline is cut exactly at the plot edges', () => {
  assert.deepEqual(clipX([[0, 0], [10, 10], [20, 0]], 5, 15), [[5, 5], [10, 10], [15, 5]]);
  assert.deepEqual(clipX([[6, 1], [8, 2]], 5, 15), [[6, 1], [8, 2]]);
});

test('the day scale: every 3 days labelled and every day lined at home, finer when zoomed, kept within the design\'s range', () => {
  const h = dayTicks(DAYS.A, DAYS.B);
  assert.deepEqual(h.major, [-6, -3, 0, 3, 6, 9]);
  assert.deepEqual(h.lines, [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual([dayText(9, 0), dayText(-3, 0), dayText(0, 0)], ['+9 d', '−3 d', '0 d']);
  const z = dayTicks(-0.2, 1.3);
  assert.equal(z.step, 0.5); assert.equal(z.decimals, 1); assert.deepEqual(z.major, [0, 0.5, 1]);
  assert.equal(dayText(-0.25, 2), '−0.25 d');
  const [a, b] = zoomDays(DAYS.A, DAYS.B, 10, 0.7);
  assert.ok(Math.abs(b - a - 1.56) < 1e-9);
  assert.ok(Math.abs((0.7 - a) / (b - a) - (0.7 - DAYS.A) / (DAYS.B - DAYS.A)) < 1e-12);  // 0.7 d stayed under the pointer
  assert.deepEqual(zoomDays(-1, 1, 0.01, 0), [DAYS.A, DAYS.B]);
  assert.ok(zoomDays(0, 1, 1000, 0.5)[1] - zoomDays(0, 1, 1000, 0.5)[0] >= DAYS.MIN_SPAN - 1e-12);
  assert.deepEqual(clampDays(8, 10), [7.4, 9.4]);
});
