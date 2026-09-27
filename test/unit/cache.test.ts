import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PromiseCache } from '../../src/cache.ts';

test('shares one computation per key, drops failures, evicts oldest over budget', async () => {
  const cache = new PromiseCache<string>(5, (v) => v.length);
  let calls = 0;
  const compute = (v: string) => () => {
    calls++;
    return Promise.resolve(v);
  };
  await Promise.all([cache.get('a', compute('aaa')), cache.get('a', compute('aaa'))]);
  assert.equal(calls, 1, 'concurrent requests share one computation');

  await assert.rejects(cache.get('x', () => Promise.reject(new Error('boom'))));
  assert.equal(await cache.get('x', compute('x')), 'x', 'failure not cached');

  await cache.get('b', compute('bbbb')); // 3 + 1 + 4 > 5: oldest ('a') evicted
  calls = 0;
  await cache.get('b', compute('bbbb'));
  await cache.get('a', compute('aaa'));
  assert.equal(calls, 1, 'b kept, a evicted');
});

test('the newest entry is kept even when it alone is over budget', async () => {
  const cache = new PromiseCache<string>(1, (v) => v.length);
  let calls = 0;
  await cache.get('big', () => {
    calls++;
    return Promise.resolve('much too big');
  });
  await cache.get('big', () => {
    calls++;
    return Promise.resolve('much too big');
  });
  assert.equal(calls, 1);
});
