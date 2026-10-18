---
id: "0014"
title: Curated smoke runner and report for real extension commands
status: review
milestone: M2
depends: ["0011", "0013"]
---

## Goal

`bun run corpus:smoke` fetches the curated extensions, runs every command
headlessly through the host, and writes a committed `compat/SMOKE.md` +
`compat/smoke.json` saying which commands render, and why the others fail.

## Context

- Curated list: `compat/corpus.json` `curated` (task 0011). Fetch with
  `bun run corpus:fetch --curated`; never modify extension files.
- For each manifest command: `bundleCommand` → `startCommand` with an empty
  broker (deny all) and preferences from the manifest's declared defaults
  (`preferences[].default`, command-level too) → wait for the first non-null
  scene or exit, with a timeout (e.g. 5 s) → shutdown.
- Result per command: `rendered` (first scene arrived; record node count and
  top-level type), `bundle-failed` (with `MISSING_DEPENDENCY` names or the
  esbuild error), `crashed` (exit code + last error/log lines), `timeout`,
  or `unsupported-mode`. Collect runtime warnings such as dropped props.
- Output is deterministic (sorted, no timestamps or absolute paths) so diffs
  show real changes. Not part of verify (needs network); a unit test covers
  the pure result-classification and report rendering.
- Code in `scripts/corpus/`.

## Acceptance

- [ ] Real run over all 10 curated extensions committed; Handoff summarises
      rendered vs failed and the top failure reasons.
- [ ] Unit tests for classification and rendering; `bun run verify` passes.
- [ ] Peak `.cache` size reported in Handoff.

Note: `corpus:fetch` replaces the sparse pattern set on each run (manifests are
always included); `scripts/corpus/corpus.ts` has the pin and pattern helpers.
Delete `.cache/raycast-extensions` when finished.

## Out of scope

- Fixing failures (those become M3 tasks); scripted interaction beyond the
  first scene.

## Handoff

```
Branch/commit: t3/curated-smoke-runner @ 0a31983
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 10.4s
Done:
  - `bun run corpus:smoke` (scripts/corpus/smoke-run.ts) fetches the curated
    set via the task-0011 fetch script, then bundles and runs every manifest
    command through `@blastlauncher/host` (`bundleCommand` → `startCommand`)
    with a deny-all `createBroker({})` and the manifest's declared preference
    defaults, waiting for the first non-null scene, the exit, or 5 s.
  - Pure logic (classification, preference defaults, sanitation, report
    rendering) in scripts/corpus/smoke.ts; offline unit tests in
    scripts/corpus/smoke.test.ts (16 tests, incl. determinism).
  - Committed artifacts: compat/smoke.json + compat/SMOKE.md, byte-identical
    across two consecutive runs (no timestamps, paths sanitized to <repo>/<tmp>).
  - Real run over all 10 curated extensions (13 commands): rendered 1
    (px-to-rem-converter/index, 11 nodes, root List); crashed 12. Top failure
    reasons: 6× "Element type is invalid … got: undefined" (components the
    shim leaves undefined, e.g. Grid/Detail in radix, axios-docs,
    fibonacci-sequence, ohmyzsh-git-alias) and 6× missing `@raycast/api`
    export (Detail ×2, Icon, Color, Keyboard, CopyToClipboardAction). No
    bundle failures, timeouts, or unsupported modes in the set.
  - Peak `.cache` size: 103 MB (after fetch, well under the 600 MB budget);
    `.cache/raycast-extensions` deleted afterwards.
Not done / risks:
  - No warnings were recorded for the one rendered command, so the warning
    collection path (dropped props) is unit-tested but not exercised live.
  - A clean no-scene exit of a `no-view` command is labelled
    `unsupported-mode` ("completed without rendering a scene"); the task's
    five outcomes have no better fit.
  - Regenerating the report emits unaligned markdown tables; `bun run fmt`
    (part of verify) aligns them, so regenerate → fmt → commit.
  - Not part of verify (needs network), as the task specifies.
```
