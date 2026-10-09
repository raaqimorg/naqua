import assert from 'node:assert/strict';
import { ConfigProvider, Effect } from 'effect';
import { test } from 'node:test';
import { REQUESTS_PER_MINUTE } from '../src/config.ts';

const parseLimit = (values: Record<string, unknown>) =>
  Effect.runSync(REQUESTS_PER_MINUTE.parse(ConfigProvider.fromUnknown(values)));

test('rate limit defaults to 60 and accepts a positive integer override', () => {
  assert.equal(parseLimit({}), 60);
  assert.equal(parseLimit({ REQUESTS_PER_MINUTE: '120' }), 120);
});

test('invalid rate-limit settings fail instead of blocking every request', () => {
  for (const value of ['0', '-1', '1.5', 'invalid']) {
    assert.throws(() => parseLimit({ REQUESTS_PER_MINUTE: value }));
  }
});
