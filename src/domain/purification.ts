import { publishedRate } from '../data/dataset.ts';
import type { Company, Status } from '../data/schema.ts';
import { splitDateRangeIntoYears, splitDaysIntoYears } from './dates.ts';

export type HoldingPeriod =
  // `end` is exclusive: the sale day. For a holding still owned it is the last
  // day of the data, which is likewise not counted, as on the website.
  | { kind: 'dates'; start: number; end: number }
  | { kind: 'days'; startYear: number; days: number };

export interface YearAmount {
  year: number;
  daysOwned: number;
  ratePerShare: number;
  status: Status | null;
  purificationAmount: number;
}

export type HoldingResult =
  | { ok: true; years: YearAmount[]; purificationAmount: number }
  | { ok: false; missingYear: number };

// Round to 10 decimal places in the website calculator's arithmetic order.
const roundAmount = (value: number): number => Number(value.toFixed(10));

export const purificationAmount = (shares: number, ratePerShare: number, days: number): number =>
  roundAmount((shares * ratePerShare * days) / 365);

export const sumAmounts = (amounts: number[]): number =>
  roundAmount(amounts.reduce((total, amount) => total + amount, 0));

export const calculateHolding = (company: Company, shares: number, period: HoldingPeriod): HoldingResult => {
  const segments =
    period.kind === 'dates'
      ? splitDateRangeIntoYears(period.start, period.end)
      : splitDaysIntoYears(period.startYear, period.days);

  const years: YearAmount[] = [];
  for (const { year, days } of segments) {
    const published = publishedRate(company, year);
    if (!published) return { ok: false, missingYear: year };
    years.push({
      year,
      daysOwned: days,
      ratePerShare: published.rate,
      status: published.status,
      purificationAmount: purificationAmount(shares, published.rate, days),
    });
  }
  return { ok: true, years, purificationAmount: sumAmounts(years.map((year) => year.purificationAmount)) };
};
