import { Result, Schema, SchemaIssue } from 'effect';
import { parseIsoDate } from '../domain/dates.ts';

// `public-sector` is the site's former `Aramco` category: a state-owned company
// that the methodology treats as permissible regardless of its financials.
export const STATUSES = ['pure', 'mixed', 'non-pure', 'public-sector'] as const;
export const StatusSchema = Schema.Literals(STATUSES);
export type Status = typeof StatusSchema.Type;

const IsoDateSchema = Schema.String.check(
  Schema.makeFilter((value) => parseIsoDate(value) !== null || 'Expected a real calendar date in YYYY-MM-DD form.'),
);
const TickerSchema = Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 9999 }));
const NameSchema = Schema.Trim.check(Schema.isNonEmpty());

// Null means unpublished or unknown; omit years with neither a rate nor a status.
export const YearEntrySchema = Schema.Struct({
  rate: Schema.NullOr(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  status: Schema.NullOr(StatusSchema),
}).check(
  Schema.makeFilter((entry) =>
    entry.rate === null && entry.status === null ? 'A year with neither a rate nor a status should be left out.' : undefined,
  ),
);
export type YearEntry = typeof YearEntrySchema.Type;

const companyFields = {
  name: NameSchema,
  aliases: Schema.Array(NameSchema),
  years: Schema.Record(Schema.String.check(Schema.isPattern(/^\d{4}$/)), YearEntrySchema),
};

export const CompanySchema = Schema.Struct({ ...companyFields, ticker: TickerSchema });
export type Company = typeof CompanySchema.Type;

// Preserve disputed candidates until an owner resolves the ticker; serve none of them.
export const UnresolvedTickerSchema = Schema.Struct({
  ticker: TickerSchema,
  reason: Schema.String.check(Schema.isNonEmpty()),
  candidates: Schema.Array(Schema.Struct(companyFields)).check(Schema.isMinLength(2)),
});
export type UnresolvedTicker = typeof UnresolvedTickerSchema.Type;

const DatasetFieldsSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  unit: Schema.String.check(Schema.isNonEmpty()),
  coverage: Schema.Struct({ start: IsoDateSchema, end: IsoDateSchema }),
  companies: Schema.Array(CompanySchema),
  unresolved: Schema.Array(UnresolvedTickerSchema),
});

type Path = (string | number)[];

// Rules across records. Effect runs them once every field is valid, so a
// broken field is reported first and these on the next run.
const crossRecordIssues = (dataset: typeof DatasetFieldsSchema.Type) => {
  const issues: { path: Path; issue: string }[] = [];
  const problem = (path: Path, issue: string) => issues.push({ path, issue });

  const firstYear = Number(dataset.coverage.start.slice(0, 4));
  const lastYear = Number(dataset.coverage.end.slice(0, 4));
  if (dataset.coverage.start >= dataset.coverage.end) problem(['coverage'], '`start` must be before `end`.');

  const seen = new Set<number>();
  const claim = (ticker: number, path: Path) => {
    if (seen.has(ticker)) problem(path, `Ticker ${ticker} appears more than once.`);
    seen.add(ticker);
  };
  const checkYears = (years: Record<string, unknown>, path: Path) => {
    for (const year of Object.keys(years)) {
      if (Number(year) < firstYear || Number(year) > lastYear) {
        problem([...path, 'years', year], `Year ${year} is outside the coverage (${firstYear}–${lastYear}).`);
      }
    }
  };

  dataset.companies.forEach((company, index) => {
    claim(company.ticker, ['companies', index, 'ticker']);
    checkYears(company.years, ['companies', index]);
  });
  dataset.unresolved.forEach((entry, index) => {
    claim(entry.ticker, ['unresolved', index, 'ticker']);
    entry.candidates.forEach((candidate, candidateIndex) =>
      checkYears(candidate.years, ['unresolved', index, 'candidates', candidateIndex]),
    );
  });
  return issues;
};

export const DatasetSchema = DatasetFieldsSchema.check(Schema.makeFilter(crossRecordIssues));
export type Dataset = typeof DatasetSchema.Type;

const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

export const issueList = (issue: SchemaIssue.Issue) =>
  formatIssue(issue).issues.map((leaf) => ({ path: (leaf.path ?? []).map(String).join('.'), message: leaf.message }));

const decode = Schema.decodeUnknownResult(DatasetSchema, { errors: 'all', onExcessProperty: 'error' });

export const decodeDataset = (input: unknown): Dataset => {
  const result = decode(input);
  if (Result.isSuccess(result)) return result.success;
  const problems = issueList(result.failure.issue).map(({ path, message }) => `  ${path}: ${message}`);
  throw new Error(`data/companies.json is invalid:\n${problems.join('\n')}`);
};
