# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a security vulnerability.

Report it privately through GitHub's private vulnerability reporting: on the repository's **Security** tab, select **Report a vulnerability**. Include the details, and the request or steps that reproduce it.

We will acknowledge your report, and we will work with you to understand and fix the problem before any public disclosure.

## Scope

This repo runs a single production deployment of the API, at [api.trynaqua.com](https://api.trynaqua.com). Only the version that runs there is supported, and there are no older supported versions. Reports about the live API and about this codebase are both in scope. The [trynaqua.com](https://trynaqua.com) website is built from a separate repository.

The rate limit holds its counters in memory, per process, and limits request volume per IP address. It is not DDoS protection, so a flood from many addresses is out of scope. A way for one client to get around the limit, for example by spoofing its address, or to exhaust the server's memory or CPU, is in scope.
