import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { Dataset } from '../../data/dataset.ts';
import { parseIsoDate } from '../../domain/dates.ts';
import { calculateHolding, sumAmounts, type HoldingPeriod } from '../../domain/purification.ts';
import type { Api } from '../api.ts';
import { RateNotAvailable, resolveCompany } from '../errors.ts';
import { coverageOf, type CalculationEntry, type Coverage } from '../schemas.ts';

// The request schema has already checked every field, so the non-null
// assertions below restate what validation guaranteed.
const toPeriod = (entry: CalculationEntry, coverage: Coverage): HoldingPeriod =>
  entry.purchaseDate === undefined
    ? { kind: 'days', startYear: entry.year!, days: entry.daysOwned! }
    : {
        kind: 'dates',
        start: parseIsoDate(entry.purchaseDate)!,
        end: entry.stillOwned ? coverage.endDay : parseIsoDate(entry.saleDate!)!,
      };

export const purificationHandlers = (api: Api) =>
  HttpApiBuilder.group(
    api,
    'purification',
    Effect.fn(function* (handlers) {
      const dataset = yield* Dataset;
      const coverage = coverageOf(dataset);

      return handlers.handle(
        'calculate',
        Effect.fn(function* ({ payload: { entries } }) {
          const calculated = yield* Effect.forEach(entries, (entry, index) =>
            Effect.gen(function* () {
              const where = { entryIndex: index };
              const company = yield* resolveCompany(dataset, entry.ticker, where);
              const result = calculateHolding(company, entry.shares, toPeriod(entry, coverage));
              if (!result.ok) return yield* RateNotAvailable.of(entry.ticker, company.name, result.missingYear, where);
              return {
                index,
                ticker: entry.ticker,
                companyName: company.name,
                shares: entry.shares,
                purificationAmount: result.purificationAmount,
                years: result.years,
              };
            }),
          );

          return {
            currency: 'SAR' as const,
            // Summed over every year of every entry, not over the per-entry
            // subtotals, so it matches the website's total to the last digit.
            totalPurificationAmount: sumAmounts(calculated.flatMap(({ years }) => years.map((year) => year.purificationAmount))),
            entries: calculated,
          };
        }),
      );
    }),
  );
