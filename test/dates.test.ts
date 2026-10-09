import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dayNumber, parseIsoDate, splitDateRangeIntoYears, splitDaysIntoYears } from '../src/domain/dates.ts';
import { purificationAmount, sumAmounts } from '../src/domain/purification.ts';

const range = (start: string, end: string) => splitDateRangeIntoYears(parseIsoDate(start)!, parseIsoDate(end)!);

describe('parseIsoDate', () => {
  test('reads a real date', () => {
    assert.equal(parseIsoDate('2024-02-29'), dayNumber(2024, 2, 29));
  });

  for (const value of ['2023-02-29', '2023-02-30', '2023-13-01', '2023-00-10', '2023-1-01', '23-01-01', '2023-01-01T00:00', '']) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      assert.equal(parseIsoDate(value), null);
    });
  }
});

describe('splitDateRangeIntoYears', () => {
  test('does not count the sale day', () => {
    assert.deepEqual(range('2023-05-01', '2023-05-02'), [{ year: 2023, days: 1 }]);
    assert.deepEqual(range('2023-01-01', '2023-12-31'), [{ year: 2023, days: 364 }]);
  });

  test('gives a full year 365 days, and a leap year 366', () => {
    assert.deepEqual(range('2023-01-01', '2024-01-01'), [{ year: 2023, days: 365 }]);
    assert.deepEqual(range('2024-01-01', '2025-01-01'), [{ year: 2024, days: 366 }]);
  });

  test('splits at each 1 January without losing a day', () => {
    const segments = range('2021-03-01', '2023-06-30');
    assert.deepEqual(segments, [
      { year: 2021, days: 306 },
      { year: 2022, days: 365 },
      { year: 2023, days: 180 },
    ]);
    const total = segments.reduce((sum, segment) => sum + segment.days, 0);
    assert.equal(total, parseIsoDate('2023-06-30')! - parseIsoDate('2021-03-01')!);
  });

  test('holding across midnight on 31 December is one day in each year', () => {
    assert.deepEqual(range('2022-12-31', '2023-01-02'), [
      { year: 2022, days: 1 },
      { year: 2023, days: 1 },
    ]);
  });

  test('is empty when the sale is not after the purchase', () => {
    assert.deepEqual(range('2023-05-01', '2023-05-01'), []);
    assert.deepEqual(range('2023-05-02', '2023-05-01'), []);
  });

  test('does not depend on the server time zone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      assert.deepEqual(range('2023-03-01', '2023-11-30'), [{ year: 2023, days: 274 }]);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('splitDaysIntoYears', () => {
  test('uses flat 365-day years and ignores leap days', () => {
    assert.deepEqual(splitDaysIntoYears(2023, 800), [
      { year: 2023, days: 365 },
      { year: 2024, days: 365 },
      { year: 2025, days: 70 },
    ]);
  });

  test('is empty for zero days', () => {
    assert.deepEqual(splitDaysIntoYears(2023, 0), []);
  });
});

describe('purificationAmount', () => {
  test('prorates the per-share rate by days held out of 365', () => {
    assert.equal(purificationAmount(1000, 0.01, 365), 10);
    assert.equal(purificationAmount(100, 0.0063, 200), 0.3452054795);
    assert.equal(purificationAmount(0, 0.05, 365), 0);
  });

  test('sums without floating-point noise', () => {
    assert.equal(sumAmounts([0.1, 0.2]), 0.3);
  });
});
