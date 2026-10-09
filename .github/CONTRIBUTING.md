# Contributing

## Start with an issue

Every pull request links to an [issue](https://github.com/raaqimorg/naqua-api/issues). Pick the form that fits:

- **Bug report:** the API, a calculation, the docs, or the local setup behaves incorrectly.
- **Data correction:** a rate, a status, or a company name differs from the published source.
- **Feature request:** a new capability or an improvement.

For a security vulnerability, see [SECURITY.md](SECURITY.md) instead.

If you only want to report something, the form asks for what happened and its impact. If you plan to send the fix, open the issue first, or pick an existing one. Then fill in the rest of the form:

- **Impact:** what breaks, and the worst case if nobody fixes it.
- **Root cause:** the code that causes the bug or the limitation.
- **Proposed fix:** a snippet or a clear description.
- **Reasoning:** why the fix solves the underlying problem.
- **Trade-offs:** whether the fix can add new bugs, hide other bugs, or only work around the issue. Also say what else the changed code touches.
- **Request and response:** for a change that a client can see, the request, and the response before and after.

Labels give the scope of an issue or a pull request. Use one type (`🐛 bug`, `✨ enhancement`, and so on), and every component and topic that it touches. Pick them from the [label list](https://github.com/raaqimorg/naqua-api/labels). On GitHub, only people with write or triage access can set labels, so write the labels that fit in the form's Labels field, or in the template's Labels section, and a maintainer applies them. A pull request gets its component and topic labels automatically from the files that it changes.

For a large or significant change, wait until the maintainers agree on the approach in the issue before you write code, so that your work is not wasted. The maintainers show their agreement with the `✅ accepted` label. Keep each pull request small, with one concern.

## Making changes

1. Fork the repo, and create a branch off `main`.
2. Set it up and run it locally. See [Try it](../README.md#try-it) in the README.
3. Follow the rules in [`AGENTS.md`](../AGENTS.md). It lists what is easy to get wrong here: the missing build step, the Effect style, the error envelope, UTC day numbers, and the rounding that mirrors the website.
4. Run `pnpm check` before you open a pull request. GitHub Actions runs the same check on every push and pull request.
5. If a fixture changed, say why in the pull request:
   - `test/fixtures/contract.json` pins what a client sees. Re-record it with `UPDATE_CONTRACT=1 pnpm test` only for an intended change.
   - `test/fixtures/legacy-differences.json` pins where the API differs from the website. Regenerate it with `UPDATE_DIFFERENCES=1 pnpm test` only for an intended change.
   - Never regenerate a fixture just to turn a red test green.
6. Update the README, or [`docs/topology.md`](../docs/topology.md), if your change alters what they describe.
7. Open the pull request into `main`. Put `Closes #<issue>` in its description, and fill in the template.

## Correcting the data

The rates in [`data/companies.json`](../data/companies.json) come from the lists that the Al-Maqased Center for Economic Consultations publishes. A correction needs that source: a link to the published list, and the page or row where the value appears.

- Change only what the source says. Then run `pnpm data:format`, which validates the file and restores its layout, so the change shows up as a one-line diff.
- Do not guess which company an `unresolved` ticker belongs to. The maintainers decide that.
- If the website still computes the old number, the parity test fails. That is expected; regenerate the allowed differences and explain the change in the pull request.

## Working with an AI agent

Install the [GitHub CLI](https://cli.github.com) (`gh`), and run `gh auth login`. With it, an agent can read an issue and its discussion (`gh issue view <number> --comments`), open an issue (`gh issue create`), and open a pull request that links to the issue (`gh pr create`). The repo's `AGENTS.md` is written for agents, and it holds the same rules as this file.

## Keeping your email private

Every commit carries an author email, and a push publishes it. To commit from this clone with an address that you choose, such as your GitHub no-reply address, run `git config --local user.email <address>`. On GitHub, under Settings, then Emails, you can also turn on "Keep my email addresses private" and "Block command line pushes that expose my email".

## License

By contributing, you agree that your code and documentation contributions are licensed under the project's [MIT license](../LICENSE). The purification rates are not yours or ours to license: they stay with the Al-Maqased Center, as the README's [License](../README.md#license) section explains.
