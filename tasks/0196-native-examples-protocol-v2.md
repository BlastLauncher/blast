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

Filled in by the worker when finishing (round 2):

```
Branch/commit: t3/native-examples-protocol-v2-fixes @ 59881d48 (plus this handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 104.6s; `go test -race ./...` PASS (7 tests); `bun run example:python` PASS (10 tests); `swift test` PASS (93 tests in 14 suites across 3 targets)
Done:
- Cached the last root view per root and redrew it on `session.exited` across all three clients per decision 0020: Swift `LauncherRouter` (`rootViews` dictionary returned on `.exited`), Go `Client` (`viewStreamState.view`, `sessionRoot`, redraw before appending `session.exited`), and Python `Client` (`_session_root`, redraw before appending `session.exited`); suppressed background root redraws while a session is active.
- Reverted the round-1 search workaround in Go (`examples/go-embedder/main_test.go`) and Python (`examples/python-embedder/test_embedder.py`) back to clearing search to `""`, asserting the cached root view is redrawn after `session.exited` with no new root view event; added the matching `LauncherRouterTests.redrawsCachedRootOnSessionExit` test in Swift.
- Guarded Python `Client._send_resync` against `OSError`/`ValueError` and wrapped `Client._read` in `try`/`finally` so stdin closing never prevents `self.closed = True` / `notify_all()`; added `test_resync_after_stdin_closed_reaches_reader_shutdown` covering closed `StringIO` and `BrokenPipeError`.
- Fixed splice remove bounds against integer overflow in Go (`remove > len(array)-at` in `examples/go-embedder/patch.go`) and Swift (`remove <= array.count - at` in `examples/macos-launcher/Sources/BlastKit/ViewPatch.swift`), and added `math.MaxInt` / `Int.max` tests in both suites.
Not done / risks:
- No new dependencies added; pre-existing Python state mutation outside `self.ready` left untouched as requested.
- Deleted `examples/macos-launcher/.build` after running `swift test` (worktree disk usage ~682 MB).
```
