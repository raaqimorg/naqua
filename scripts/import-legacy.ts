
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatDataset } from '../src/data/format.ts';
import { decodeDataset, type Company, type Status, type UnresolvedTicker, type YearEntry } from '../src/data/schema.ts';

const DEFAULT_SOURCE = '../Purefi-Fresh/src/features/purification/data/pure-percentages.json';
const ROOT = new URL('..', import.meta.url);

type LegacyCell = number | string | null | { value: number | string | null; status: string | null };
interface LegacyRow {
  name: string;
  companyNumber: number;
  category: 'pure' | 'mixed' | 'non-pure' | 'Changeable' | 'Aramco';
  purification: Record<string, LegacyCell>;
}

interface NormalizedRow {
  ticker: number;
  legacyName: string;
  name: string;
  aliases: string[];
  years: Record<string, YearEntry>;
}

const sourcePath = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_SOURCE);
const sourceText = readFileSync(sourcePath, 'utf8');
const source = JSON.parse(sourceText) as { schemaVersion?: number; companies: LegacyRow[] };
const legacyRows = source.companies;

const notes = {
  nullStrings: new Map<string, string[]>(),
  nullStatuses: new Map<string, string[]>(),
  categoryMismatch: new Map<string, string[]>(),
  renamed: [] as string[],
  merged: [] as string[],
  mergeConflicts: [] as string[],
  sharedNames: [] as string[],
};
const noteYear = (bucket: Map<string, string[]>, row: LegacyRow, year: string) => {
  const key = `${row.companyNumber} ${row.name}`;
  const years = bucket.get(key) ?? [];
  if (!years.includes(year)) bucket.set(key, [...years, year]);
};

const STATIC_STATUS: Record<LegacyRow['category'], Status | null> = {
  pure: 'pure',
  mixed: 'mixed',
  'non-pure': 'non-pure',
  Aramco: 'public-sector',
  Changeable: null,
};

const toRate = (value: unknown, row: LegacyRow, year: string): number | null => {
  if (value === 'null') {
    noteYear(notes.nullStrings, row, year);
    return null;
  }
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${row.companyNumber} ${row.name} ${year}: unexpected rate ${JSON.stringify(value)}`);
  }
  return value;
};

const toStatus = (value: unknown, row: LegacyRow, year: string): Status | null => {
  if (value === 'null' || value === null) {
    if (value === 'null') noteYear(notes.nullStatuses, row, year);
    return null;
  }
  if (value === 'Aramco') return 'public-sector';
  if (value === 'pure' || value === 'mixed' || value === 'non-pure') return value;
  throw new Error(`${row.companyNumber} ${row.name} ${year}: unexpected status ${JSON.stringify(value)}`);
};

const normalizeRow = (row: LegacyRow): NormalizedRow => {
  const [name, ...aliases] = row.name.split('|').map((part) => part.trim());
  if (aliases.length > 0) notes.renamed.push(`${row.companyNumber} "${row.name}" → name "${name}", aliases ${JSON.stringify(aliases)}`);

  const years: Record<string, YearEntry> = {};
  for (const [year, cell] of Object.entries(row.purification)) {
    let entry: YearEntry;
    if (cell !== null && typeof cell === 'object') {
      if (source.schemaVersion !== 2 && row.category !== 'Changeable') noteYear(notes.categoryMismatch, row, year);
      entry = { rate: toRate(cell.value, row, year), status: toStatus(cell.status, row, year) };
    } else {
      const rate = toRate(cell, row, year);
      // A fixed category says nothing about years the company has no rate for
      // (typically before it listed), so it is only attached to rated years.
      entry = { rate, status: rate === null ? null : STATIC_STATUS[row.category] };
    }
    if (entry.rate !== null || entry.status !== null) years[year] = entry;
  }
  return { ticker: row.companyNumber, legacyName: row.name, name: name!, aliases, years };
};

// Rows repeating the same company are merged year by year. Where they disagree
// the first row wins, because that is the row the website's calculator reads.
const mergeRows = (rows: NormalizedRow[]): NormalizedRow => {
  const [first, ...rest] = rows;
  const years = { ...first!.years };
  for (const [position, row] of rest.entries()) {
    for (const [year, entry] of Object.entries(row.years)) {
      const kept = years[year];
      if (!kept) {
        years[year] = entry;
        notes.merged.push(`${row.ticker} ${row.legacyName}: ${year} taken from duplicate row #${position + 2} (${JSON.stringify(entry)})`);
      } else if (kept.rate !== entry.rate || kept.status !== entry.status) {
        notes.mergeConflicts.push(
          `${row.ticker} ${row.legacyName} ${year}: kept ${JSON.stringify(kept)} from the first row, ignored ${JSON.stringify(entry)} from row #${position + 2}`,
        );
      }
    }
  }
  return { ...first!, years };
};

const byTicker = new Map<number, NormalizedRow[]>();
for (const row of legacyRows) {
  const normalized = normalizeRow(row);
  byTicker.set(row.companyNumber, [...(byTicker.get(row.companyNumber) ?? []), normalized]);
}

const companies: Company[] = [];
const unresolved: UnresolvedTicker[] = [];
for (const [ticker, rows] of byTicker) {
  const names = [...new Set(rows.map((row) => row.legacyName))];
  if (names.length === 1) {
    const { name, aliases, years } = rows.length > 1 ? mergeRows(rows) : rows[0]!;
    companies.push({ ticker, name, aliases, years });
    continue;
  }
  unresolved.push({
    ticker,
    reason: `The source lists ${names.length} different companies under this ticker: ${names.join('، ')}.`,
    candidates: names.map((legacyName) => {
      const { name, aliases, years } = mergeRows(rows.filter((row) => row.legacyName === legacyName));
      return { name, aliases, years };
    }),
  });
}

const tickersByName = new Map<string, number[]>();
for (const [ticker, rows] of byTicker) {
  for (const name of new Set(rows.map((row) => row.name))) {
    tickersByName.set(name, [...(tickersByName.get(name) ?? []), ticker]);
  }
}
for (const [name, tickers] of tickersByName) {
  if (tickers.length > 1) notes.sharedNames.push(`"${name}" appears under tickers ${tickers.sort().join(', ')}`);
}

const allYears = legacyRows.flatMap((row) => Object.keys(row.purification).map(Number));
const dataset = decodeDataset({
  schemaVersion: 1,
  unit: 'SAR to purify per share held for a full year',
  coverage: { start: `${Math.min(...allYears)}-01-01`, end: `${Math.max(...allYears)}-12-31` },
  companies,
  unresolved,
});

writeFileSync(new URL('data/companies.json', ROOT), formatDataset(dataset));

const yearList = (bucket: Map<string, string[]>) =>
  [...bucket].map(([company, years]) => `- ${company}: ${years.join(', ')}`);
const bullets = (items: string[]) => (items.length === 0 ? ['None.'] : items.map((item) => (item.startsWith('- ') ? item : `- ${item}`)));

const report = [
  '# Import report',
  '',
  'Generated by `pnpm data:import`. Do not edit by hand — re-run the import instead.',
  '',
  `- Source: \`${path.basename(sourcePath)}\` (sha256 \`${createHash('sha256').update(sourceText).digest('hex').slice(0, 12)}\`)`,
  `- Source rows: ${legacyRows.length}`,
  `- Companies imported: ${companies.length}`,
  `- Tickers left unresolved: ${unresolved.length}`,
  `- Coverage: ${dataset.coverage.start} to ${dataset.coverage.end}`,
  '',
  '## Needs a decision',
  '',
  'These tickers are listed under more than one company in the source. They are kept',
  'in `unresolved` and the API answers `409 AMBIGUOUS_TICKER` for them. To fix one, move',
  'the right candidate into `companies` with its ticker and delete the entry.',
  '',
  ...bullets(
    [...unresolved].sort((a, b) => a.ticker - b.ticker).map(
      (entry) =>
        `**${entry.ticker}**: ${entry.candidates
          .map((candidate) => `${candidate.name} (years ${Object.keys(candidate.years).join(', ') || 'none'})`)
          .join(' vs ')}`,
    ),
  ),
  '',
  '## Names that appear under more than one ticker',
  '',
  ...bullets(notes.sharedNames),
  '',
  '## Changes made',
  '',
  '### The string `"null"` used as a rate — read as "no rate"',
  '',
  'The website treats these as malformed data (`INVALID_RATE_DATA`) rather than as missing.',
  '',
  ...bullets(yearList(notes.nullStrings)),
  '',
  '### The string `"null"` used as a status — read as "unknown status"',
  '',
  ...bullets(yearList(notes.nullStatuses)),
  '',
  '### Per-year `{ value, status }` on a company with a fixed category',
  '',
  'The website rejects these years (`INVALID_RATE_DATA`); the import keeps the per-year value and status.',
  '',
  ...bullets(yearList(notes.categoryMismatch)),
  '',
  '### Names split on `|` into a name and aliases',
  '',
  ...bullets(notes.renamed),
  '',
  '### Duplicate rows merged',
  '',
  'Years missing from the first row but present in a repeat of it. The website only ever',
  'reads the first row, so these years were unreachable there.',
  '',
  ...bullets(notes.merged),
  '',
  '### Duplicate rows that disagree — first row kept',
  '',
  ...bullets(notes.mergeConflicts),
  '',
  '### Category `Aramco` renamed',
  '',
  '- The `Aramco` category and status are now `public-sector`.',
  '',
];
console.log(report.join('\n'));

console.log(
  `Imported ${companies.length} companies (${unresolved.length} unresolved tickers) from ${path.relative(process.cwd(), sourcePath)}.`,
);
