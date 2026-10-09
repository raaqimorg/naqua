# نقوة | Naqwa — Purification API

Public API for Saudi (Tadawul) stock purification: the published purification
rate for each company and year, and a calculator for how much to purify for a
set of holdings. It is the same calculation as the calculator on
[trynaqua.com](https://trynaqua.com), and a test sweep (below) holds the two to
the same numbers.

The rates are the ones published by the
[Al-Maqased Center for Economic Consultations](https://almaqased.net)
(مركز المقاصد للاستشارات الاقتصادية), under the supervision of Dr. Mohammed bin
Saud Al-Osaimi (د. محمد بن سعود العصيمي). They are not covered by this
repository's license; see [License](#license).

> The rates and amounts are for information only. They are not a fatwa or
> financial advice; for a ruling on your own holdings, consult a qualified
> scholar.

- **Configured deployment URL:** `https://api.trynaqua.com` — interactive docs at `/docs`, OpenAPI 3.1 at `/openapi.json`
- **Stack:** Node 24 (runs the TypeScript directly, no build step), [Effect](https://effect.website) 4 for the HTTP API, validation and OpenAPI

## Endpoints

| Method | Path | |
|---|---|---|
| `GET` | `/v1/companies` | Every company, with the years that have a rate |
| `GET` | `/v1/companies/{ticker}` | One company and everything known about each year |
| `GET` | `/v1/companies/{ticker}/rates/{year}` | One year's rate |
| `POST` | `/v1/purification/calculate` | Purification amount for up to 100 holdings |
| `GET` | `/v1/meta` | Coverage, data version, unit, formula, limits |
| `GET` | `/health` | Liveness (not rate limited) |

```bash
curl -s https://api.trynaqua.com/v1/purification/calculate \
  -H 'Content-Type: application/json' \
  -d '{"entries":[
        {"ticker":2330,"shares":100,"purchaseDate":"2021-03-01","saleDate":"2023-06-30"},
        {"ticker":2222,"shares":10,"purchaseDate":"2023-01-01","stillOwned":true},
        {"ticker":2001,"shares":50,"year":2022,"daysOwned":200}
      ]}'
```

**The formula.** A holding is split into calendar years, and each year is
prorated: `shares × ratePerShare × daysOwned / 365`. In date mode the sale day
is not counted, so a full year runs from 1 January to the next 1 January (365
days, or 366 in a leap year). A `stillOwned` holding runs until the last day of
the data (`coverage.end`), which is likewise not counted. The divisor is always
365, so a leap year held in full comes to 366/365 of that year's rate. Both
match the website's calculator. Days mode has no calendar: the count is cut
into consecutive 365-day years from `year`. Amounts are in SAR to 10 decimal
places.

**Errors** always look like `{ "error": { "code", "message": { "ar", "en" }, "details"? } }`.
Codes are stable: `VALIDATION_ERROR` (400), `UNKNOWN_TICKER` (404),
`RATE_NOT_AVAILABLE` (404 on a lookup, 422 in a calculation), `AMBIGUOUS_TICKER`
(409), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429), `NOT_FOUND`,
`INTERNAL_ERROR`. A calculation is all-or-nothing, and `details.entryIndex`
names the entry that failed.

**Limits.** 60 requests per minute per IP to the `/v1` endpoints (set
`REQUESTS_PER_MINUTE` to change it), 100 entries and 100 KB per request. Every
response from a `/v1` endpoint carries `X-Data-Version`, which changes whenever
the data does.

## The data

`data/companies.json` is the dataset the API serves. It is loaded and validated
when the server starts, so a malformed file stops the deploy rather than
breaking requests.

```jsonc
{
  "schemaVersion": 1,
  "unit": "SAR to purify per share held for a full year",
  "coverage": { "start": "2015-01-01", "end": "2024-12-31" },
  "companies": [
    {
      "ticker": 2330,
      "name": "المتقدمة",
      "aliases": [],                    // former or alternative names
      "years": {
        "2015": { "rate": 0.0199, "status": "mixed" },
        "2016": { "rate": 0.0139, "status": "mixed" }
      }
    }
  ],
  "unresolved": [ /* tickers the source assigns to two companies — see below */ ]
}
```

- Every year has the same shape: `rate` (a number, or `null` if none was
  published) and `status` (`pure`, `mixed`, `non-pure`, `public-sector`, or
  `null` if unknown). A year with neither is left out.
- There is no company-wide category. Classification is per year, and the API
  derives an `overallStatus` (the status if it never changed, else `varies`).
- Tickers are unique. A ticker the source gives to two different companies sits
  in `unresolved` with every candidate kept, and the API answers
  `409 AMBIGUOUS_TICKER` for it until someone decides which one is right.
- The file has one canonical layout: sorted by ticker, one year per line. A rate
  change then shows up as exactly a one-line diff.

### Editing it

1. Edit `data/companies.json`. To add a year, add a line to each company. To
   extend the data past 2024, also move `coverage.end`.
2. `pnpm data:format` validates the file and restores the canonical layout.
3. `pnpm test`. If a change alters a number the website still computes
   differently, the parity test fails. That is intended; see below.

To resolve an `unresolved` ticker, move the correct candidate into `companies`
(adding its `ticker`), and give the other its real ticker or drop it.

### Where it came from

The file was generated from the website's `pure-percentages.json` by
`pnpm data:import`. The command prints a report of its changes and any ticker
still waiting for a decision. The website remains the data editing source for
now; do not independently edit both copies. Run `pnpm data:import` after a site data change and review the diff.
The importer accepts both the original mixed shapes and the site's schema v2
(uniform `{ value, status }` cells). The API commits its own validated snapshot
so it can deploy without the website checkout or a live network dependency.
The website's repository is private, so `pnpm data:import` and
`pnpm fixture:capture` can only be run by its maintainers.

The site's September 2026 cleanup fixes the eight cells previously listed in
`legacy-differences.json`; the refreshed parity fixture now requires zero
rate or amount differences. The site's ticker review (its `docs/DATA.md`) then
moved five rows the source had filed under another company's ticker, so no
ticker is unresolved; each company is keyed by its current Tadawul symbol.

## Parity with the website

`test/parity.test.ts` checks this API against outputs recorded from the
website's own calculator code (`test/fixtures/legacy-site.json`). It compares
every company × year rate, and about 1,700 generated holdings in both modes,
year by year, down to the last decimal. The only differences it allows are the
data fixes pinned in `test/fixtures/legacy-differences.json`. An unexplained new
difference fails the test, and so does a listed one that disappears.

- Re-record the site's outputs (needs Bun and the site checked out alongside):
  `TZ=Asia/Riyadh pnpm fixture:capture ../Purefi-Fresh`
- After an intended change, regenerate the allowed differences and **review the
  diff**: `UPDATE_DIFFERENCES=1 pnpm test`. Never do it just to turn a red test green.

## The HTTP contract

`test/contract.test.ts` pins what a client sees: for about 30 requests,
covering every endpoint and every error code, it records the status, every
header and the body in `test/fixtures/contract.json`. After an intended change,
re-record it and review the diff: `UPDATE_CONTRACT=1 pnpm test`.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000, restarts on change
pnpm test         # node --test
pnpm typecheck
pnpm lint
pnpm check        # all three, as CI runs them
```

Node runs the `.ts` files directly by stripping the types, which brings three
rules (the compiler and linter enforce them):

- Relative imports spell out `.ts`.
- Type-only imports use `import type`.
- No enums, namespaces or constructor parameter properties.

`docs/architecture.html` (open it in a browser) walks through how a request
moves through the app.

## Deployment

Render, from `render.yaml`: `pnpm install --prod`, then `node src/server.ts`. There
is no build artifact, so what runs in production is exactly what the tests ran.

- **First time:** Render → New → Blueprint → this repo. Then, in DNS, add
  `CNAME api → naqwa-api.onrender.com`.
- **Free plan:** the service sleeps after ~15 idle minutes, and the next request
  waits for a cold start. An uptime monitor on `/health` both alerts on outages
  and keeps it awake.
- **Rate limiting is in memory.** It is correct only while there is one
  instance, and it resets on every restart. It keys on the first
  `X-Forwarded-For` address when that is a real IP address, and tracks at most
  10,000 clients at a time, so made-up addresses cannot run it out of memory.
  Treat it as a courtesy limit rather than protection against abuse.
- **After the first deploy,** check whether Render lets a client choose that
  address. If all 70 of these requests get a 200, it does, and the limiter
  should key on a header the proxy sets instead:

  ```bash
  for i in $(seq 70); do
    curl -s -o /dev/null -w '%{http_code}\n' -H "X-Forwarded-For: 198.51.100.$i" https://api.trynaqua.com/v1/meta
  done | sort | uniq -c
  ```
- **Rollback:** Render → `naqwa-api` → Events → an earlier deploy → Rollback.

## License

The code is released under the [MIT License](LICENSE). That license does not
cover the purification rates in `data/` and the test fixtures. They come from
the Al-Maqased Center for Economic Consultations, which reserves all rights to
its published lists, so ask the center before reusing them.

To report a security problem, use **Report a vulnerability** on this
repository’s Security tab. Keep reports private until the issue is fixed;
please do not open a public issue for vulnerabilities.
