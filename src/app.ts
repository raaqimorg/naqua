import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api';
import { PUBLIC_URL, REQUESTS_PER_MINUTE } from './config.ts';
import { Dataset } from './data/dataset.ts';
import { makeApi } from './http/api.ts';
import { companiesHandlers } from './http/handlers/companies.ts';
import { healthHandlers, metaHandlers } from './http/handlers/meta.ts';
import { purificationHandlers } from './http/handlers/purification.ts';
import { DataVersion, EntryLimit, JsonBody, RateLimit, RequestValidation, RouterMiddleware } from './http/middleware.ts';
import { coverageOf } from './http/schemas.ts';

const IndexRoute = HttpRouter.add('GET', '/', HttpServerResponse.redirect('/docs'));

const SCALAR_VERSION = '1.43.5';

export const AppLayer = Layer.unwrap(
  Effect.gen(function* () {
    const dataset = yield* Dataset;
    const api = makeApi({
      coverage: coverageOf(dataset),
      requestsPerMinute: yield* REQUESTS_PER_MINUTE,
      publicUrl: yield* PUBLIC_URL,
    });

    return Layer.mergeAll(
      HttpApiBuilder.layer(api, { openapiPath: '/openapi.json' }).pipe(
        Layer.provide([companiesHandlers(api), purificationHandlers(api), metaHandlers(api), healthHandlers(api)]),
        Layer.provide([RequestValidation.layer, EntryLimit.layer, JsonBody.layer, RateLimit.layer, DataVersion.layer]),
      ),
      HttpApiScalar.layerCdn(api, { path: '/docs', version: SCALAR_VERSION }),
      IndexRoute,
      RouterMiddleware,
    );
  }),
);
