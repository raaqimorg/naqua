# نقوة | Naqua — Purification API

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

## Run locally

Requires Node 24+ and pnpm 12.4.2 (pinned in `package.json`). With Node 24's
Corepack installed:

```bash
git clone https://github.com/Mohammedbbk/naqua-api.git
cd naqua-api
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open [the local API docs](http://localhost:3000/docs), or try:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1/companies/2330/rates/2023
```

The committed dataset covers **2015–2024** for **219 companies**. Holdings
outside that coverage cannot be calculated. `stillOwned` uses the dataset's
end date, rather than today's date.

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listening port |
| `PUBLIC_URL` | `https://api.trynaqua.com` | Server URL shown in OpenAPI and interactive docs |
| `REQUESTS_PER_MINUTE` | `60` | Positive integer limit per IP |

For interactive docs that send requests to your local server, set
`PUBLIC_URL=http://localhost:3000` before starting it. Environment variables
must be set in your shell or hosting dashboard; `.env` files are not loaded
automatically.

The root URL `/` redirects to the interactive documentation at `/docs`.

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

Oversized requests with a declared content length receive 413. On the Node
server, oversized chunked uploads can close the connection before an error
response is sent.

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

1. Edit `data/companies.json`. Add yearly entries only where a published rate
   or status is available. To extend the data past 2024, also move `coverage.end`.
2. `pnpm data:format` validates the file and restores the canonical layout.
3. `pnpm test`. If a change alters a number the website still computes
   differently, the parity test fails. That is intended; see below.

To resolve an `unresolved` ticker, move the correct candidate into `companies`
(adding its `ticker`), and give the other its real ticker or drop it.

### Where it came from

The dataset originated from the purification data used by trynaqua.com.
This repository includes a validated snapshot, so running the API and tests
does not require the private website repository or a live network connection.
Update `data/companies.json` using the editing steps above.

## Parity with the website

`test/parity.test.ts` checks this API against outputs recorded from the
website's own calculator code (`test/fixtures/legacy-site.json`). It compares
every company × year rate, and about 1,700 generated holdings in both modes,
year by year, down to the last decimal. The only differences it allows are the
data fixes pinned in `test/fixtures/legacy-differences.json`. An unexplained new
difference fails the test, and so does a listed one that disappears.

The website outputs are committed reference fixtures; tests do not need the
website checkout. After an intended change, regenerate the allowed differences
and **review the diff**: `UPDATE_DIFFERENCES=1 pnpm test`. Never do it just to
turn a red test green.

## The HTTP contract

`test/contract.test.ts` pins what a client sees: for about 30 requests,
covering every endpoint and every error code, it records the status, every
header and the body in `test/fixtures/contract.json`. After an intended change,
re-record it and review the diff: `UPDATE_CONTRACT=1 pnpm test`.

## Development

```bash
pnpm install --frozen-lockfile
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

Contributions should include `pnpm check` passing. For a data correction,
provide the source and review any changes to the parity fixtures. The
`"private": true` field in `package.json` prevents accidental npm publishing;
it does not control the GitHub repository's visibility or the code license.

## Deployment

Render, from `render.yaml`: `pnpm install --prod`, then `node src/server.ts`. There
is no build artifact, so what runs in production is exactly what the tests ran.

- **First time:** Render → New → Blueprint → this repo. Use the service's
  assigned `onrender.com` hostname as the DNS target for your custom domain.
  Forks should change `domains` in `render.yaml` and set `PUBLIC_URL` to their
  own API address.
- **Free plan:** the service sleeps after ~15 idle minutes, and the next request
  waits for a cold start. Use `/health` for liveness monitoring.
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
- **Rollback:** Render → `naqua-api` → Events → an earlier deploy → Rollback.

## License

The code is released under the [MIT License](LICENSE). That license does not
cover the purification rates in `data/` and the test fixtures. They come from
the Al-Maqased Center for Economic Consultations, which reserves all rights to
its published lists, so ask the center before reusing them.

To report a security problem, use **Report a vulnerability** in the
repository's Security tab when private reporting is enabled. Keep reports
private until the issue is fixed; please do not open a public issue for
vulnerabilities. Maintainers must enable private vulnerability reporting when
making the repository public.
