// Pin intentional differences from recorded website outputs. After an intended
// change, run UPDATE_DIFFERENCES=1 pnpm test and review the fixture diff.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { parseIsoDate, splitDateRangeIntoYears, splitDaysIntoYears } from '../src/domain/dates.ts';
import { calculate, dataset, get, json } from './helpers.ts';

type CellOutcome = { rate: number; status: string | null } | 'unavailable';
interface SiteYear {
  year: number;
  daysOwned: number;
  purificationAmount: number;
  status: string;
}
interface Holding {
  ticker: number;
  shares: number;
  purchaseDate?: string;
  saleDate?: string;
  stillOwned?: boolean;
  year?: number;
  daysOwned?: number;
  site: { years: SiteYear[] } | { error: string };
}
interface Fixture {
  rates: Record<string, Record<string, { rate: number; status: string } | { unavailable: string }>>;
  holdings: Holding[];
}

const fixture = JSON.parse(readFileSync(new URL('fixtures/legacy-site.json', import.meta.url), 'utf8')) as Fixture;
const DIFFERENCES_URL = new URL('fixtures/legacy-differences.json', import.meta.url);

const siteStatus = (status: string): string | null => {
  if (status === 'Aramco') return 'public-sector';
  if (status === 'null') return null;
  return status;
};

const siteCell = (cell: Fixture['rates'][string][string]): CellOutcome =>
  'unavailable' in cell ? 'unavailable' : { rate: cell.rate, status: siteStatus(cell.status) };

const apiCell = async (ticker: string, year: string): Promise<CellOutcome> => {
  const response = await get(`/v1/companies/${ticker}/rates/${year}`);
  if (response.status === 404) return 'unavailable';
  assert.equal(response.status, 200, `${ticker}/${year}`);
  const body = await json(response);
  return { rate: body.ratePerShare, status: body.status };
};

const holdingYears = (holding: Holding): number[] => {
  const coverageEnd = parseIsoDate(dataset.coverage.end)!;
  const segments =
    holding.purchaseDate === undefined
      ? splitDaysIntoYears(holding.year!, holding.daysOwned!)
      : splitDateRangeIntoYears(
          parseIsoDate(holding.purchaseDate)!,
          holding.stillOwned ? coverageEnd : parseIsoDate(holding.saleDate!)!,
        );
  return segments.map((segment) => segment.year);
};

describe('parity with the website calculator', () => {
  const differences: { ticker: number; year: number; site: CellOutcome; api: CellOutcome }[] = [];

  test('every company-year rate matches, apart from the documented data fixes', async () => {
    for (const [ticker, years] of Object.entries(fixture.rates)) {
      for (const [year, cell] of Object.entries(years)) {
        const site = siteCell(cell);
        const api = await apiCell(ticker, year);
        if (JSON.stringify(site) !== JSON.stringify(api)) {
          differences.push({ ticker: Number(ticker), year: Number(year), site, api });
        }
      }
    }

    if (process.env.UPDATE_DIFFERENCES) {
      writeFileSync(DIFFERENCES_URL, `${JSON.stringify(differences, null, 2)}\n`);
    }
    const expected = JSON.parse(readFileSync(DIFFERENCES_URL, 'utf8'));
    assert.deepEqual(differences, expected);
  });

  test('every holding gives the same years, days, amounts and status', async () => {
    const differing = new Set(differences.map(({ ticker, year }) => `${ticker}:${year}`));
    let compared = 0;
    let comparedSuccesses = 0;

    for (const holding of fixture.holdings) {
      if (holdingYears(holding).some((year) => differing.has(`${holding.ticker}:${year}`))) continue;
      const { site, ...entry } = holding;
      const response = await calculate({ entries: [entry] });
      const body = await json(response);
      const label = JSON.stringify(entry);
      compared++;

      if ('error' in site) {
        // Boot validation excludes malformed cells; only unpublished rates remain unusable.
        assert.equal(response.status, 422, label);
        assert.equal(body.error.code, 'RATE_NOT_AVAILABLE', label);
        continue;
      }

      assert.equal(response.status, 200, label);
      const apiYears = body.entries[0].years.map((year: SiteYear) => ({
        year: year.year,
        daysOwned: year.daysOwned,
        purificationAmount: year.purificationAmount,
        status: year.status,
      }));
      const siteYears = site.years.map((year) => ({ ...year, status: siteStatus(year.status) }));
      assert.deepEqual(apiYears, siteYears, label);
      const siteTotal = Number(site.years.reduce((sum, year) => sum + year.purificationAmount, 0).toFixed(10));
      assert.equal(body.totalPurificationAmount, siteTotal, label);
      comparedSuccesses++;
    }

    assert.ok(compared > 1500, `only ${compared} holdings compared`);
    assert.ok(comparedSuccesses > 900, `only ${comparedSuccesses} successful holdings compared`);
  });
});
