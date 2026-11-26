---
id: "0196"
title: Swift, Go and Python examples speak embedder protocol 2
status: doing
milestone: M17
depends: ["0194"]
---

## Goal

The three `blast serve` example embedders speak embedder protocol 2
(`docs/decisions/0020-embedder-protocol-v2.md`): they apply `*.view.patch`
events to the last full view, resync on a revision gap, and their CI jobs are
green again.

Shares one PR with task 0194 (same branch `task/0194-embedder-protocol-v2`).

## Context

- Spec: decision 0020. Reference implementation and its tests:
  `packages/protocol/src/view-patch.ts` / `view-patch.test.ts`; serve side in
  `packages/serve/src/serve.ts`. Port `applyViewPatch` semantics exactly:
  ops `set` / `delete` / `splice` on key paths; throw/err on a missing path.
- Go: `examples/go-embedder/main.go` (handles `root.view`/`session.view`
  around line 471; the `embedder-v1` comment at line 13), tests in
  `main_test.go`; CI runs `go test ./...` in that directory.
- Python: `examples/python-embedder/embedder.py` (line ~156) and
  `test_embedder.py`; CI runs `bun run example:python`.
- Swift: `examples/macos-launcher/Sources/BlastKit/Client.swift` (event
  decoding, `session.scene` forwarding ~line 354), `View.swift`,
  `Sources/BlastPresenter/LauncherRouter.swift`; tests under
  `Tests/BlastKitTests` and `Tests/BlastPresenterTests`; CI runs `swift test`
  in `examples/macos-launcher`. `swift`, `go` and `python3` exist locally.
- Each client keeps the last view and revision per root/session. On
  `baseRevision` mismatch or an apply error: send `root.resync` /
  `session.resync`, ignore patches until the next full view. Hellos send
  `"protocol": 2`. Drop the Swift `session.scene` handling unless a test needs
  it; the examples do not set `scenes: true`.
- Patch application must work on the language's generic JSON value (map/
  dict/`JSONValue`), then decode to the typed view, so new view fields never
  need applier changes.
- READMEs of the three examples: update protocol mentions.
- Shared fixtures: write one JSON fixture file of (prev, patch, next) cases
  generated from the TypeScript `diffView` (e.g. a small `bun` script under
  `scripts/protocol/` that writes `fixtures/protocol/view-patches.json`, and a
  test that fails if the file is stale), and have all three languages' tests
  apply every case and compare to `next`. Include a selection move, a
  one-row edit, a search filter, a `delete`, and a `null`↔object change.

## Acceptance

- [ ] `go test ./...` in `examples/go-embedder` passes.
- [ ] `bun run example:python` passes.
- [ ] `swift test` in `examples/macos-launcher` passes.
- [ ] Each language has a test that applies every case in the shared fixture,
      and a test that a revision gap triggers a resync request.
- [ ] `git grep -n embedder-v1` and `git grep -n '"protocol": *1'` in
      `examples/` are empty.
- [ ] `bun run verify` passes.

## Out of scope

- Any change to `packages/` beyond what the shared fixture script needs.
- New example features or UI changes.
- Editing `PLAN.md`, `AGENTS.md`, decision 0020 or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
