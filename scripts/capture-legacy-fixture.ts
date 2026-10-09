// Requires Bun and the website checkout: TZ=Asia/Riyadh pnpm fixture:capture ../Purefi-Fresh
// The website uses local dates, so capture in its users' timezone.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const siteDir = path.resolve(process.argv[2] ?? '../Purefi-Fresh');
const domainDir = path.join(siteDir, 'src/features/purification');

const { resolvePurificationRate } = await import(path.join(domainDir, 'purificationRate.ts'));
const { calculateEntryRows } = await import(path.join(domainDir, 'calculateEntries.ts'));
const { PurificationError } = await import(path.join(domainDir, 'errors.ts'));

interface LegacyRow {
  name: string;
  companyNumber: number;
  category: string;
  purification: Record<string, unknown>;
}
const rows = (JSON.parse(readFileSync(path.join(domainDir, 'data/pure-percentages.json'), 'utf8')) as { companies: LegacyRow[] })
  .companies;

const FIRST_YEAR = 2015;
const LAST_YEAR = 2024;
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index);

// Match the website’s first-row lookup. Disputed tickers are covered by API tests.
const namesByTicker = new Map<number, Set<string>>();
for (const row of rows) {
  namesByTicker.set(row.companyNumber, (namesByTicker.get(row.companyNumber) ?? new Set()).add(row.name));
}
const firstRows = [...new Map(rows.toReversed().map((row) => [row.companyNumber, row])).values()]
  .filter((row) => namesByTicker.get(row.companyNumber)!.size === 1)
  .sort((a, b) => a.companyNumber - b.companyNumber);

type SiteOutcome<T> = { ok: true; value: T } | { ok: false; code: string };
const capture = <T>(run: () => T): SiteOutcome<T> => {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof PurificationError) return { ok: false, code: (error as { code: string }).code };
    throw error;
  }
};

const rates = Object.fromEntries(
  firstRows.map((row) => [
    row.companyNumber,
    Object.fromEntries(
      YEARS.map((year) => {
        const outcome = capture(() => resolvePurificationRate(row, String(year)));
        if (!outcome.ok) return [year, { unavailable: outcome.code }];
        const { purificationRate, status } = outcome.value as { purificationRate: unknown; status: string };
        const rate = Number(purificationRate);
        if (purificationRate === null || Number.isNaN(rate)) return [year, { unavailable: 'RATE_NOT_AVAILABLE' }];
        return [year, { rate, status }];
      }),
    ),
  ]),
);

// Seeded randomness keeps fixture captures reproducible.
let seed = 0x6e617177;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const DAY_MS = 86_400_000;
const START_UTC = Date.UTC(FIRST_YEAR, 0, 1);
const END_UTC = Date.UTC(LAST_YEAR, 11, 31);
const TOTAL_DAYS = (END_UTC - START_UTC) / DAY_MS;
const isoOf = (day: number) => new Date(START_UTC + day * DAY_MS).toISOString().slice(0, 10);
const localDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
};
const SHARES = [1, 7, 100, 137, 1000, 2500.5, 12345] as const;

const holdings = firstRows.flatMap((row) =>
  Array.from({ length: 8 }, (_, variant) => {
    const shares = pick(SHARES);
    let request: Record<string, unknown>;
    let siteEntry: Record<string, unknown>;

    if (variant < 5) {
      const start = integer(0, TOTAL_DAYS - 1);
      const stillOwned = variant === 4;
      const end = stillOwned ? TOTAL_DAYS : Math.min(TOTAL_DAYS, start + integer(1, variant === 0 ? 40 : 1500));
      request = stillOwned
        ? { purchaseDate: isoOf(start), stillOwned: true }
        : { purchaseDate: isoOf(start), saleDate: isoOf(end) };
      siteEntry = {
        calculationType: 'dates',
        year: 0,
        daysOwned: 0,
        purchaseDate: localDate(isoOf(start)),
        saleDate: stillOwned ? undefined : localDate(isoOf(end)),
        stillOwned,
      };
    } else {
      const year = integer(FIRST_YEAR, LAST_YEAR);
      const daysOwned = integer(1, (LAST_YEAR - year + 1) * 365);
      request = { year, daysOwned };
      siteEntry = { calculationType: 'days', year, daysOwned };
    }

    const outcome = capture(
      () =>
        calculateEntryRows({ id: '', company: row.name, shares, ...siteEntry }, row, () => '') as {
          year: number;
          daysOwned: number;
          purificationPercentage: number;
          purificationAmount: number;
          status: string;
        }[],
    );

    return {
      ticker: row.companyNumber,
      shares,
      ...request,
      site: outcome.ok
        ? {
            years: outcome.value.map((result) => ({
              year: result.year,
              daysOwned: result.daysOwned,
              purificationAmount: result.purificationAmount,
              status: result.status,
            })),
          }
        : { error: outcome.code },
    };
  }),
);

const git = (...args: string[]) => execFileSync('git', ['-C', siteDir, ...args], { encoding: 'utf8' }).trim();
const fixture = {
  capturedFrom: {
    commit: git('rev-parse', '--short', 'HEAD'),
    uncommittedChanges: git('status', '--porcelain', '--', 'src/features/purification').length > 0,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  rates,
  holdings,
};

const target = new URL('../test/fixtures/legacy-site.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(fixture)}\n`);
console.log(`Captured ${Object.keys(rates).length} companies and ${holdings.length} holdings from ${siteDir}.`);
