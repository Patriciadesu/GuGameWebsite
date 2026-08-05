import assert from 'node:assert/strict';
import test from 'node:test';
import { KeyedBatchLoader } from './keyedBatchLoader';

test('KeyedBatchLoader combines concurrent keys and duplicate requests', async () => {
  let calls = 0;
  const loader = new KeyedBatchLoader(async keys => {
    calls += 1;
    return new Map(keys.map(key => [key, `value-${key}`]));
  });

  const values = await Promise.all([
    loader.load('a'),
    loader.load('b'),
    loader.load('a')
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(values, ['value-a', 'value-b', 'value-a']);
});

test('KeyedBatchLoader rejects every request when a batch fails', async () => {
  const loader = new KeyedBatchLoader<string>(async () => {
    throw new Error('database unavailable');
  });

  const results = await Promise.allSettled([
    loader.load('a'),
    loader.load('b')
  ]);

  assert.equal(results.every(result => result.status === 'rejected'), true);
});
