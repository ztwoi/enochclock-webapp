// Deep Time's axis mapping: exact and consistent with the data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DL, xYear, yOff } from '../src/deep.ts';

test('deep-time axis is linear in the year', () => {
  assert.equal(xYear(DL.YA), DL.PX0);
  assert.equal(xYear(DL.YB), DL.PX1);
  assert.equal(yOff(0), DL.Z);
  assert.equal(yOff(1) - yOff(2), DL.K);
});
