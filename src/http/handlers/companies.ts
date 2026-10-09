import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { Dataset, overallStatus, publishedRate, publishedRates } from '../../data/dataset.ts';
import type { Api } from '../api.ts';
import { RateNotAvailable, resolveCompany } from '../errors.ts';

export const companiesHandlers = (api: Api) =>
  HttpApiBuilder.group(
    api,
    'companies',
    Effect.fn(function* (handlers) {
      const dataset = yield* Dataset;

      const companies = [...dataset.companies]
        .sort((a, b) => a.ticker - b.ticker)
        .map((company) => ({
          ticker: company.ticker,
          name: company.name,
          aliases: company.aliases,
          overallStatus: overallStatus(company),
          availableYears: publishedRates(company).map((rate) => rate.year),
        }));
      const list = { count: companies.length, companies };

      return handlers.handleAll({
        list: () => Effect.succeed(list),

        detail: ({ params: { ticker } }) =>
          resolveCompany(dataset, ticker).pipe(
            Effect.map((company) => ({
              ticker: company.ticker,
              name: company.name,
              aliases: company.aliases,
              overallStatus: overallStatus(company),
              years: Object.keys(company.years)
                .map(Number)
                .sort((a, b) => a - b)
                .map((year) => {
                  const { rate, status } = company.years[String(year)]!;
                  return { year, ratePerShare: rate, status };
                }),
            })),
          ),

        rate: Effect.fn(function* ({ params: { ticker, year } }) {
          const company = yield* resolveCompany(dataset, ticker);
          const rate = publishedRate(company, year);
          if (!rate) return yield* RateNotAvailable.of(ticker, company.name, year);
          return { ticker, name: company.name, year, ratePerShare: rate.rate, status: rate.status };
        }),
      });
    }),
  );
