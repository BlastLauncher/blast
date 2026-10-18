---
id: "0014"
title: Curated smoke runner and report for real extension commands
status: todo
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

## Out of scope

- Fixing failures (those become M3 tasks); scripted interaction beyond the
  first scene.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
