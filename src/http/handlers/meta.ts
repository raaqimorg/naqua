import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { API_VERSION, REQUESTS_PER_MINUTE } from '../../config.ts';
import { Dataset } from '../../data/dataset.ts';
import type { Api } from '../api.ts';
import { MAX_ENTRIES_PER_REQUEST } from '../schemas.ts';

export const metaHandlers = (api: Api) =>
  HttpApiBuilder.group(
    api,
    'meta',
    Effect.fn(function* (handlers) {
      const dataset = yield* Dataset;

      const meta = {
        apiVersion: API_VERSION,
        dataVersion: dataset.version,
        coverage: { start: dataset.coverage.start, end: dataset.coverage.end, years: dataset.years },
        unit: dataset.unit,
        formula: 'purificationAmount = shares × ratePerShare × daysOwned / 365, for each calendar year held',
        companyCount: dataset.companies.length,
        unresolvedTickers: dataset.unresolved.map((entry) => entry.ticker).sort((a, b) => a - b),
        rateLimit: { requestsPerMinute: yield* REQUESTS_PER_MINUTE },
        maxEntriesPerRequest: MAX_ENTRIES_PER_REQUEST,
      };

      return handlers.handle('meta', () => Effect.succeed(meta));
    }),
  );

export const healthHandlers = (api: Api) =>
  HttpApiBuilder.group(api, 'health', (handlers) => handlers.handle('health', () => Effect.succeed({ status: 'ok' as const })));
