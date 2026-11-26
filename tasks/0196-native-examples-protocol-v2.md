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

- [x] `go test ./...` in `examples/go-embedder` passes.
- [x] `bun run example:python` passes.
- [x] `swift test` in `examples/macos-launcher` passes.
- [x] Each language has a test that applies every case in the shared fixture,
      and a test that a revision gap triggers a resync request.
- [x] `git grep -n embedder-v1` and `git grep -n '"protocol": *1'` in
      `examples/` are empty.
- [x] `bun run verify` passes.

## Out of scope

- Any change to `packages/` beyond what the shared fixture script needs.
- New example features or UI changes.
- Editing `PLAN.md`, `AGENTS.md`, decision 0020 or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/native-examples-protocol-v2 @ 4ef95c58 (plus this handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 103.2s; `go test ./...` PASS (7 tests); `bun run example:python` PASS (9 tests); `swift test` PASS (54 tests in 8 suites)
Done:
- Added `scripts/protocol/generate-view-patch-fixtures.ts`, generated `fixtures/protocol/view-patches.json` (10 cases covering selection move, one-row edit, search filter, empty filter, null<->object, optional key delete, array prepend/append, root replace, no-op), and added staleness/round-trip test `scripts/protocol/view-patch-fixtures.test.ts`.
- Ported Go (`examples/go-embedder/patch.go`, `main.go`, `main_test.go`, `README.md`) to embedder protocol 2: generic JSON patch applier (`set`/`delete`/`splice`), per-root/session revision tracking, `*.resync` on revision gap or apply error while dropping patches until the next full view, shared fixture tests, and resync unit tests.
- Ported Python (`examples/python-embedder/embedder.py`, `test_embedder.py`, `README.md`) to embedder protocol 2 with pure `apply_view_patch`, thread-safe resync on revision gap or apply error, shared fixture tests, and resync unit tests.
- Ported Swift (`examples/macos-launcher/Sources/BlastKit/ViewPatch.swift`, `Client.swift`, `README.md`, and `Tests/BlastKitTests/*`) to embedder protocol 2, dropped unused `session.scene` handling, added `ViewPatchTests` against the shared fixture, and added resync/recovery tests in `ClientTests`.
- Updated `examples/browser-demo/highlight.test.ts` sample strings from `"protocol":1` to `"protocol":2` so `git grep -n '"protocol": *1' examples/` is empty.
Not done / risks:
- No new dependencies added.
- In Go and Python end-to-end flow tests, narrowed root search to `"hello"` before launching instead of clearing to `""` beforehand, because protocol 2 suppresses no-op updates when the root clears an already-empty search on session exit.
- Deleted `examples/macos-launcher/.build` after running `swift test` to keep disk usage minimal.
```
