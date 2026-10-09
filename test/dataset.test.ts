import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { DATASET_PATH, overallStatus, parseDataset } from '../src/data/dataset.ts';
import { formatDataset } from '../src/data/format.ts';
import type { Company, Dataset } from '../src/data/schema.ts';

const source = readFileSync(DATASET_PATH, 'utf8');

const minimal = (overrides: Partial<Dataset> = {}): Dataset => ({
  schemaVersion: 1,
  unit: 'SAR',
  coverage: { start: '2015-01-01', end: '2024-12-31' },
  companies: [{ ticker: 2330, name: 'المتقدمة', aliases: [], years: { '2023': { rate: 0.02, status: 'pure' } } }],
  unresolved: [],
  ...overrides,
});
const company = (fields: Partial<Company>): Company => ({ ticker: 1111, name: 'x', aliases: [], years: {}, ...fields });
const parse = (dataset: unknown) => parseDataset(JSON.stringify(dataset));

describe('data/companies.json', () => {
  test('is valid', () => {
    assert.doesNotThrow(() => parseDataset(source));
  });

  test('is in the canonical layout (run `pnpm data:format` after editing it)', () => {
    assert.equal(formatDataset(parseDataset(source)), source);
  });
});

describe('dataset validation', () => {
  test('accepts a minimal dataset', () => {
    assert.equal(parse(minimal()).companies.length, 1);
  });

  test('rejects a ticker listed twice', () => {
    const duplicate = minimal({ companies: [company({ ticker: 2330 }), company({ ticker: 2330 })] });
    assert.throws(() => parse(duplicate), /Ticker 2330 appears more than once/);
  });

  test('rejects a ticker that is both a company and unresolved', () => {
    const clash = minimal({
      unresolved: [
        {
          ticker: 2330,
          reason: 'two names',
          candidates: [
            { name: 'a', aliases: [], years: {} },
            { name: 'b', aliases: [], years: {} },
          ],
        },
      ],
    });
    assert.throws(() => parse(clash), /Ticker 2330 appears more than once/);
  });

  test('rejects a year outside the coverage', () => {
    const outside = minimal({ companies: [company({ years: { '2025': { rate: 0.01, status: 'pure' } } })] });
    assert.throws(() => parse(outside), /Year 2025 is outside the coverage/);
  });

  test('rejects a year with nothing in it', () => {
    const empty = minimal({ companies: [company({ years: { '2020': { rate: null, status: null } } })] });
    assert.throws(() => parse(empty), /neither a rate nor a status/);
  });

  for (const [label, entry] of [
    ['the string "null" as a rate', { rate: 'null', status: 'pure' }],
    ['a negative rate', { rate: -0.1, status: 'pure' }],
    ['an unknown status', { rate: 0.01, status: 'Aramco' }],
    ['an extra field', { rate: 0.01, status: 'pure', note: 'x' }],
  ] as const) {
    test(`rejects ${label}`, () => {
      assert.throws(() => parse(minimal({ companies: [company({ years: { '2020': entry as never } })] })));
    });
  }

  test('lists every broken field, not just the first', () => {
    const broken = minimal({ companies: [company({ ticker: 12, name: ' ' })] });
    assert.throws(
      () => parse(broken),
      (error: Error) => error.message.includes('companies.0.ticker') && error.message.includes('companies.0.name'),
    );
  });

  test('lists every broken rule across records, not just the first', () => {
    const broken = minimal({
      companies: [company({ ticker: 2330, years: { '2030': { rate: 0.01, status: 'pure' } } }), company({ ticker: 2330 })],
    });
    assert.throws(
      () => parse(broken),
      (error: Error) => error.message.includes('Year 2030') && error.message.includes('Ticker 2330 appears more than once'),
    );
  });
});

describe('overallStatus', () => {
  test('is the status when every year agrees, ignoring unknown years', () => {
    const steady = company({ years: { '2020': { rate: 0.01, status: 'pure' }, '2021': { rate: 0.01, status: null } } });
    assert.equal(overallStatus(steady), 'pure');
  });

  test('is `varies` when the status changed', () => {
    const changed = company({ years: { '2020': { rate: 0.01, status: 'pure' }, '2021': { rate: 0.01, status: 'mixed' } } });
    assert.equal(overallStatus(changed), 'varies');
  });

  test('is null when no year has a status', () => {
    assert.equal(overallStatus(company({ years: { '2020': { rate: 0.01, status: null } } })), null);
  });
});
