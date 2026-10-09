import { Config, Schema } from 'effect';
import packageJson from '../package.json' with { type: 'json' };

export const API_VERSION = packageJson.version;
export const MAX_BODY_BYTES = 100 * 1024;

export const PORT = Config.Port('PORT').pipe(Config.withDefault(3000));
export const PUBLIC_URL = Config.String('PUBLIC_URL').pipe(Config.withDefault('https://api.trynaqua.com'));
export const REQUESTS_PER_MINUTE = Config.schema(
  Schema.Int.check(Schema.isGreaterThan(0)),
  'REQUESTS_PER_MINUTE',
).pipe(Config.withDefault(60));
