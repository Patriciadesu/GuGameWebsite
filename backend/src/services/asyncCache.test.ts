import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncTtlCache, KeyedAsyncTtlCache } from './asyncCache';

test('AsyncTtlCache coalesces concurrent cache misses', async () => {
  const cache = new AsyncTtlCache<number>(1_000);
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return 42;
  };

  const values = await Promise.all(Array.from({ length: 50 }, () => cache.get(loader)));
  assert.deepEqual(new Set(values), new Set([42]));
  assert.equal(loads, 1);
});

test('AsyncTtlCache invalidates and refreshes', async () => {
  const cache = new AsyncTtlCache<number>(10_000);
  let value = 1;
  assert.equal(await cache.get(async () => value), 1);
  value = 2;
  assert.equal(await cache.get(async () => value), 1);
  cache.clear();
  assert.equal(await cache.get(async () => value), 2);
});

test('AsyncTtlCache serves stale data when a refresh fails', async () => {
  const cache = new AsyncTtlCache<number>(10_000);
  assert.equal(await cache.get(async () => 7), 7);
  assert.equal(await cache.get(async () => {
    throw new Error('upstream unavailable');
  }, true), 7);
});

test('KeyedAsyncTtlCache isolates keys and coalesces each key', async () => {
  const cache = new KeyedAsyncTtlCache<string>(1_000);
  let loads = 0;
  const load = async (key: string) => {
    loads += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return key.toUpperCase();
  };

  const values = await Promise.all([
    ...Array.from({ length: 20 }, () => cache.get('a', () => load('a'))),
    ...Array.from({ length: 20 }, () => cache.get('b', () => load('b')))
  ]);
  assert.equal(values.filter(value => value === 'A').length, 20);
  assert.equal(values.filter(value => value === 'B').length, 20);
  assert.equal(loads, 2);
});

test('KeyedAsyncTtlCache supports explicit set and delete', async () => {
  const cache = new KeyedAsyncTtlCache<number>(1_000);
  cache.set('answer', 42);
  assert.equal(await cache.get('answer', async () => 0), 42);
  cache.delete('answer');
  assert.equal(await cache.get('answer', async () => 7), 7);
});
