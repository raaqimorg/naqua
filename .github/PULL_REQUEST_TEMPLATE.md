Closes #

<!-- Give the issue that this PR resolves. If there is no issue, open one first (see CONTRIBUTING.md). -->

## What changed

<!-- Write one or two sentences: what this PR does, and why. -->

## Labels

<!-- List every label that fits from https://github.com/raaqimorg/naqua/labels: one type, and each component and topic that this PR touches. A maintainer applies them. -->

## Request and response

<!-- For a change that a client can see, show the request, and the response before and after. The diff of test/fixtures/contract.json is enough. If nothing a client sees changed, delete this section. -->

## Checks

- [ ] The linked issue covers the impact, root cause, proposed fix, reasoning, and trade-offs. For a larger change, the maintainers agreed on the approach there.
- [ ] This PR does one thing.
- [ ] `pnpm check` passes locally (CI runs the same check).
- [ ] The changed code follows the rules in [`AGENTS.md`](../AGENTS.md).
- [ ] If `contract.json` or `legacy-differences.json` was regenerated, the change was intended, and the reason is given above.
- [ ] A data change cites its published source, and `pnpm data:format` was run.
- [ ] The README or `docs/topology.md` is updated, if it describes what changed.

## Notes for the reviewer

<!-- Write anything that is not obvious: a trade-off that you made, something that you left out on purpose, or a follow-up that you plan. If there is nothing, delete this section. -->
