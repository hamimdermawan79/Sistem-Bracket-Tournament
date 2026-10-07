import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNames, wheelRanges, firstDrawingRound } from '../src/lib/drawing.ts';

test('one line per player, trimmed, blank lines ignored and duplicate names preserved', () => {
  assert.deepEqual(parseNames(' Alice \r\n\r\n Bob\n'), ['Alice', 'Bob']);
  assert.deepEqual(parseNames('Alice\nAlice\nalice'), ['Alice', 'Alice', 'alice']);
});
test('128 slots split into four contiguous equal wheels', () => {
  assert.deepEqual(wheelRanges(128, 4), [{ start: 1, end: 32 }, { start: 33, end: 64 }, { start: 65, end: 96 }, { start: 97, end: 128 }]);
});
test('every supported wheel configuration covers all numbers exactly once', () => {
  for (let cap = 2; cap <= 128; cap++) for (let count = 1; count <= cap; count++) {
    const ranges = wheelRanges(cap, count);
    const sizes = ranges.map(r => r.end - r.start + 1);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.deepEqual(ranges.flatMap(r => Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i)), Array.from({ length: cap }, (_, i) => i + 1));
    const round = firstDrawingRound(cap);
    assert.ok(2 ** (8 - round) >= cap);
    assert.ok(2 ** (7 - round) < cap);
  }
});
