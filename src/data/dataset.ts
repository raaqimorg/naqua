import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Context, Layer } from 'effect';
import { decodeDataset, type Company, type Dataset as DatasetFile, type Status, type UnresolvedTicker } from './schema.ts';

export const DATASET_PATH = new URL('../../data/companies.json', import.meta.url);

export type TickerLookup =
  | { kind: 'found'; company: Company }
  | { kind: 'unresolved'; entry: UnresolvedTicker }
  | { kind: 'unknown' };

export interface PublishedRate {
  year: number;
  rate: number;
  status: Status | null;
}

export interface LoadedDataset extends DatasetFile {
  version: string;
  years: number[];
  lookup: (ticker: number) => TickerLookup;
}

export const parseDataset = (source: string): LoadedDataset => {
  const dataset = decodeDataset(JSON.parse(source));

  const companies = new Map(dataset.companies.map((company) => [company.ticker, company]));
  const unresolved = new Map(dataset.unresolved.map((entry) => [entry.ticker, entry]));

  const firstYear = Number(dataset.coverage.start.slice(0, 4));
  const lastYear = Number(dataset.coverage.end.slice(0, 4));

  return {
    ...dataset,
    version: createHash('sha256').update(source).digest('hex').slice(0, 12),
    years: Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index),
    lookup: (ticker) => {
      const company = companies.get(ticker);
      if (company) return { kind: 'found', company };
      const entry = unresolved.get(ticker);
      if (entry) return { kind: 'unresolved', entry };
      return { kind: 'unknown' };
    },
  };
};

export const loadDataset = (path: URL | string = DATASET_PATH): LoadedDataset =>
  parseDataset(readFileSync(path, 'utf8'));

export class Dataset extends Context.Service<Dataset, LoadedDataset>()('naqua/Dataset') {
  static readonly layer = Layer.sync(Dataset, () => loadDataset());
}

export const publishedRate = (company: Company, year: number): PublishedRate | null => {
  const entry = company.years[String(year)];
  if (!entry || entry.rate === null) return null;
  return { year, rate: entry.rate, status: entry.status };
};

export const publishedRates = (company: Company): PublishedRate[] =>
  Object.keys(company.years)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => publishedRate(company, year))
    .filter((rate): rate is PublishedRate => rate !== null);

export const overallStatus = (company: Company): Status | 'varies' | null => {
  const statuses = new Set(
    Object.values(company.years)
      .map((entry) => entry.status)
      .filter((status): status is Status => status !== null),
  );
  if (statuses.size === 0) return null;
  if (statuses.size > 1) return 'varies';
  return [...statuses][0]!;
};
