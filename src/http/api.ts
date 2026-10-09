import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { API_VERSION } from '../config.ts';
import { AmbiguousTicker, RateNotAvailable, UnknownTicker } from './errors.ts';
import { DataVersion, JsonBody, RateLimit, RequestValidation } from './middleware.ts';
import {
  CalculationResponseSchema,
  CompanyDetailSchema,
  CompanyListSchema,
  HealthSchema,
  MetaSchema,
  RateParams,
  RateSchema,
  TickerParams,
  calculationRequestSchema,
  type Coverage,
} from './schemas.ts';

const companies = HttpApiGroup.make('companies')
  .add(
    HttpApiEndpoint.get('list', '/v1/companies', { success: CompanyListSchema }).annotate(
      OpenApi.Summary,
      'Every company in the database',
    ),
    HttpApiEndpoint.get('detail', '/v1/companies/:ticker', {
      params: TickerParams,
      success: CompanyDetailSchema,
      error: [UnknownTicker, AmbiguousTicker],
    })
      .middleware(RequestValidation)
      .annotate(OpenApi.Summary, 'One company and everything known about each year'),
    HttpApiEndpoint.get('rate', '/v1/companies/:ticker/rates/:year', {
      params: RateParams,
      success: RateSchema,
      error: [UnknownTicker, RateNotAvailable, AmbiguousTicker],
    })
      .middleware(RequestValidation)
      .annotate(OpenApi.Summary, "A company's purification rate for one year"),
  )
  .annotate(OpenApi.Title, 'Companies');

const purification = (coverage: Coverage) =>
  HttpApiGroup.make('purification')
    .add(
      HttpApiEndpoint.post('calculate', '/v1/purification/calculate', {
        payload: calculationRequestSchema(coverage),
        success: CalculationResponseSchema,
        error: [UnknownTicker, AmbiguousTicker, RateNotAvailable.pipe(HttpApiSchema.status(422))],
      })
        .middleware(RequestValidation)
        .middleware(JsonBody)
        .annotateMerge(
          OpenApi.annotations({
            summary: 'Calculate the purification amount for a set of holdings',
            description:
              'Each holding is split into calendar years and each year is prorated: ' +
              '`shares × ratePerShare × daysOwned / 365`. The request is all-or-nothing: if any entry cannot be ' +
              'calculated, nothing is returned and `details.entryIndex` names the entry.',
          }),
        ),
    )
    .annotate(OpenApi.Title, 'Purification');

const meta = HttpApiGroup.make('meta')
  .add(
    HttpApiEndpoint.get('meta', '/v1/meta', { success: MetaSchema }).annotate(
      OpenApi.Summary,
      'Data coverage, version, limits and the formula',
    ),
  )
  .annotate(OpenApi.Title, 'Meta');

const health = HttpApiGroup.make('health')
  .add(HttpApiEndpoint.get('health', '/health', { success: HealthSchema }).annotate(OpenApi.Summary, 'Liveness check'))
  .annotate(OpenApi.Title, 'Health');

export const makeApi = ({
  coverage,
  requestsPerMinute,
  publicUrl,
}: {
  coverage: Coverage;
  requestsPerMinute: number;
  publicUrl: string;
}) =>
  HttpApi.make('naqwa')
    .add(companies, purification(coverage), meta)
    // Only the groups added so far, the ones under /v1. The last one added runs first.
    .middleware(RateLimit)
    .middleware(DataVersion)
    .add(health)
    .annotate(HttpApi.ParseOptions, { errors: 'all' })
    .annotateMerge(
      OpenApi.annotations({
        title: 'Naqwa Purification API',
        version: API_VERSION,
        description:
          'Stock purification rates for Saudi (Tadawul) companies, and a calculator for the amount to purify. ' +
          'Every error carries a stable `code` and a message in Arabic and English. ' +
          `Requests under /v1 are limited to ${requestsPerMinute} per minute per IP.`,
        servers: [{ url: publicUrl }],
      }),
    );

export type Api = ReturnType<typeof makeApi>;
