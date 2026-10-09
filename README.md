# Naqua

نقوة، تطهير الأسهم السعودية · Saudi stock purification

[Calculator](https://trynaqua.com) · [API docs](https://api.trynaqua.com/docs) · [OpenAPI](https://api.trynaqua.com/openapi.json) · [Code: MIT](LICENSE) · [Data rights](#license)

Naqua provides purification rates for Saudi (Tadawul) stocks and calculates
how much to purify for a set of holdings. At [trynaqua.com](https://trynaqua.com),
you can use the calculator in your browser. The API exposes the same
calculation as JSON. The source code is available here, and contributions are
welcome.

| Companies | Years | Currency | API version |
|---|---|---|---|
| 219 | 2015–2024 | SAR | v1 |

From the committed snapshot in `data/companies.json`. A company's inclusion
does not mean it has a published rate for every year. Holdings outside the
data's coverage cannot be calculated; `stillOwned` stops at the data's end
date, rather than today's date.

> Rates and calculations are for information only. They are not a fatwa or
> financial advice. Consult a qualified scholar for a ruling on your holdings.

## Try it

**Use the calculator.** Open [trynaqua.com](https://trynaqua.com).

**Ask the API.** No key or sign-up is required:

```bash
curl https://api.trynaqua.com/v1/companies/2330/rates/2023
```

Calculate purification for 100 shares held for 200 days in 2023:

```bash
curl https://api.trynaqua.com/v1/purification/calculate \
  -H 'Content-Type: application/json' \
  -d '{"entries":[{"ticker":2330,"shares":100,"year":2023,"daysOwned":200}]}'
```

This returns a total of `1.1123287671` SAR, with a breakdown by holding and year.

**Run it locally.** You need Node 24+ and pnpm 12.4.2. With Node 24's Corepack
installed:

```bash
git clone https://github.com/raaqimorg/naqua.git
cd naqua
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The API is at [localhost:3000](http://localhost:3000), which redirects to the
[interactive docs](http://localhost:3000/docs). No database or private website
checkout is needed. Set `PUBLIC_URL=http://localhost:3000` before starting the
server if you want the docs to send requests to your local API.

## API

[api.trynaqua.com/v1](https://api.trynaqua.com/v1/meta) serves JSON for companies,
yearly rates, and purification calculations. Explore the
[interactive docs](https://api.trynaqua.com/docs) or the
[OpenAPI document](https://api.trynaqua.com/openapi.json).

| Method | Path | Returns |
|---|---|---|
| GET | `/v1/companies` | Companies and years with published rates |
| GET | `/v1/companies/{ticker}` | A company and its yearly records |
| GET | `/v1/companies/{ticker}/rates/{year}` | One year's rate |
| POST | `/v1/purification/calculate` | Amounts for a set of holdings |
| GET | `/v1/meta` | Coverage, data version, formula, and limits |
| GET | `/health` | Liveness, outside the rate limit |

| Limit | Default |
|---|---|
| Requests | 60 per minute per IP for `/v1` endpoints |
| Holdings | 100 per calculation |
| Request body | 100 KiB (102,400 bytes) |

Responses from `/v1` endpoints include `X-Data-Version` and rate-limit headers.
A refused request gets `429` with `Retry-After`. The limiter is held in memory,
is per process, and resets on restart. Its current forwarded-IP handling is a
courtesy limit, not reliable protection against deliberate evasion.

Errors have a stable `error.code`, a message in Arabic and English, and
optional `details`. A calculation is all-or-nothing: if one holding fails,
`details.entryIndex` identifies it. Validation errors return `400`, unknown
companies `404`, disputed tickers `409`, and missing rates `404` on a lookup or
`422` in a calculation. Oversized bodies return `413`, though an oversized
chunked upload can close the Node connection before a response is sent.

## Data

The rates are published by the
[Al-Maqased Center for Economic Consultations](https://almaqased.net)
(مركز المقاصد للاستشارات الاقتصادية), under the supervision of Dr. Mohammed bin
Saud Al-Osaimi (د. محمد بن سعود العصيمي). The snapshot originated from the data
used by trynaqua.com. The rates are **not covered by the code's MIT license**.

`data/companies.json` is the source the API serves. It is validated and loaded
at startup, with no live network dependency. Each company has a ticker, an
Arabic name, aliases, and yearly records containing a rate and a status.
A rate is an amount in SAR per share for a full year, not a percentage.

Statuses are `pure`, `mixed`, `non-pure`, or `public-sector`. A `null` rate
means none was published; zero is a valid rate. Classification belongs to the
year. `overallStatus` is the known status if it stayed the same, or `varies` if
it changed. Disputed tickers are preserved in `unresolved` and cannot be used
until a maintainer resolves them.

To update the data, edit the published records, extend `coverage.end` when
needed, and run `pnpm data:format` followed by `pnpm test`. Include the source
for corrections. The formatter keeps each year on one line so changes are easy
to review.

## How it works

A request is validated, matched to a company in the loaded dataset, and passed
to the calculation functions. Each year's amount is prorated:

```text
purificationAmount = shares × ratePerShare × daysOwned / 365
```

| Part | Role | Built with |
|---|---|---|
| `src/domain/` | Date ranges and purification arithmetic | Plain TypeScript |
| `src/data/` | Dataset validation, ticker lookups, and formatting | Effect Schema, Node.js |
| `src/http/` | API contract, handlers, middleware, and errors | Effect HTTP API |
| `src/app.ts`, `src/server.ts` | Application assembly and server startup | Effect Layers, Node.js |
| `data/` | Committed rate snapshot | JSON |
| `test/` | Dates, validation, API behavior, and website parity | Node.js test runner |
| `scripts/` | Dataset formatter | Node.js |

Node 24 runs the TypeScript directly; there is no build step. API schemas also
generate the OpenAPI document. Production runs on Render.

<details>
<summary>Calculation details</summary>

Date mode accepts `purchaseDate` with either `saleDate` or `stillOwned: true`.
It splits the holding at calendar-year boundaries and excludes the sale day.
A full year therefore runs from 1 January to the following 1 January.
`stillOwned` uses `coverage.end` as the excluded end date.

Days mode accepts `year` and `daysOwned`. It splits the count into consecutive
365-day chunks; it does not observe leap days. Date mode counts leap days, but
the formula always divides by 365, so a full leap year contributes 366/365 of
the published annual rate.

Amounts are rounded to 10 decimal places in the same arithmetic order as the
website. The grand total sums every yearly amount, rather than the rounded
per-holding subtotals. A missing rate fails the entire request.

</details>

<details>
<summary>Configuration and deployment</summary>

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listening port |
| `PUBLIC_URL` | `https://api.trynaqua.com` | Server URL in OpenAPI and the docs |
| `REQUESTS_PER_MINUTE` | `60` | Positive integer limit per IP |

Set variables in your shell or hosting dashboard. `.env` files are not loaded
automatically.

For Render, create a Blueprint from `render.yaml`, or configure a Node web
service with:

```text
Build: corepack pnpm install --frozen-lockfile --prod
Start: node src/server.ts
Health check: /health
Node version: 24
```

For a fork, change `domains` in the Blueprint and set `PUBLIC_URL` to your own
API address. Point the custom domain's CNAME to the hostname Render assigns,
and verify the domain in Render. Free services sleep after approximately
15 minutes without traffic and can take time to wake up.

Keep a single instance while using the in-memory limiter. Verify how your
proxy sets client-IP headers before relying on per-IP limits. Roll back through
the service's Events page by selecting an earlier deploy.

</details>

## Contributing

Report bugs and ideas in [GitHub issues](https://github.com/raaqimorg/naqua/issues).
For code or data changes:

1. Branch from `main`, or fork the repository.
2. Make your change and run `pnpm check`.
3. Open a pull request into `main` explaining the change and how you checked it.

`AGENTS.md` describes the repository's implementation rules. The
`"private": true` setting in `package.json` prevents accidental npm publishing;
it does not determine the code's license or the repository's visibility.

<details>
<summary>What pnpm check verifies</summary>

`pnpm check` runs type checking, ESLint, and the Node.js tests. The compiler
checks that TypeScript can run through Node's type stripping: relative imports
end in `.ts`, type-only imports use `import type`, and non-erasable features
such as enums and constructor parameter properties are excluded.

The parity tests compare every recorded company-year rate and 1,752 generated
holdings against committed outputs from the website calculator. Tests require
no access to the website repository. Intentional rate differences are pinned
in `test/fixtures/legacy-differences.json`.

The contract tests pin response statuses, headers, and bodies in
`test/fixtures/contract.json`. For intended changes only, regenerate the
relevant fixture and review the diff:

```bash
UPDATE_DIFFERENCES=1 pnpm test
UPDATE_CONTRACT=1 pnpm test
```

Do not regenerate fixtures just to make a failing test pass.

</details>

## Contact

Naqua lives under [Raaqim](https://github.com/raaqimorg). Use
[issues](https://github.com/raaqimorg/naqua/issues) for bugs, ideas, and data
corrections. For a security issue, use **Report a vulnerability** in the
repository's Security tab when private reporting is enabled. Please keep
vulnerability reports out of public issues. Maintainers must enable private
reporting when making the repository public.

## License

The code is released under the [MIT license](LICENSE). The purification rates
in `data/` and the rate data in test fixtures are excluded. They come from the
Al-Maqased Center for Economic Consultations, which reserves all rights to its
published lists. Ask the center before reusing or redistributing those rates.
