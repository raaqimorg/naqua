import type { Dataset, YearEntry } from './schema.ts';

// One year per line keeps hand-edited rate changes to a single-line diff.

const yearLines = (years: Record<string, YearEntry>, indent: string): string => {
  const entries = Object.keys(years)
    .sort()
    .map((year) => {
      const { rate, status } = years[year]!;
      return `${indent}  ${JSON.stringify(year)}: { "rate": ${JSON.stringify(rate)}, "status": ${JSON.stringify(status)} }`;
    });
  return entries.length === 0 ? '{}' : `{\n${entries.join(',\n')}\n${indent}}`;
};

const companyBlock = (
  fields: { ticker?: number; name: string; aliases: readonly string[]; years: Record<string, YearEntry> },
  indent: string,
): string => {
  const lines = [
    ...(fields.ticker === undefined ? [] : [`${indent}  "ticker": ${fields.ticker}`]),
    `${indent}  "name": ${JSON.stringify(fields.name)}`,
    `${indent}  "aliases": ${JSON.stringify(fields.aliases)}`,
    `${indent}  "years": ${yearLines(fields.years, `${indent}  `)}`,
  ];
  return `${indent}{\n${lines.join(',\n')}\n${indent}}`;
};

const list = (blocks: string[], indent: string): string =>
  blocks.length === 0 ? '[]' : `[\n${blocks.join(',\n')}\n${indent}]`;

export const formatDataset = (dataset: Dataset): string => {
  const companies = [...dataset.companies]
    .sort((a, b) => a.ticker - b.ticker)
    .map((company) => companyBlock(company, '    '));

  const unresolved = [...dataset.unresolved]
    .sort((a, b) => a.ticker - b.ticker)
    .map((entry) => {
      const candidates = entry.candidates.map((candidate) => companyBlock(candidate, '        '));
      return [
        '    {',
        `      "ticker": ${entry.ticker},`,
        `      "reason": ${JSON.stringify(entry.reason)},`,
        `      "candidates": ${list(candidates, '      ')}`,
        '    }',
      ].join('\n');
    });

  return [
    '{',
    `  "schemaVersion": ${dataset.schemaVersion},`,
    `  "unit": ${JSON.stringify(dataset.unit)},`,
    `  "coverage": { "start": ${JSON.stringify(dataset.coverage.start)}, "end": ${JSON.stringify(dataset.coverage.end)} },`,
    `  "companies": ${list(companies, '  ')},`,
    `  "unresolved": ${list(unresolved, '  ')}`,
    '}',
    '',
  ].join('\n');
};
