---
id: "0032"
title: Never hang on feedback without a commit; updateCommandMetadata
status: doing
milestone: M3
depends: []
---

## Goal

A command can never hang because a feedback promise waits for a React commit
that will not happen, and `updateCommandMetadata` works (last curated
blocker besides expected capability denials).

## Context

- Found in task 0028: `one-thing/set-one-thing` (run with
  `--argument oneThing=x`) hangs. Its view command's default export is an
  async function that awaits `showToast`; React never commits that
  "component" (it returns a Promise), and `showToast` resolves only after a
  commit (decision 0004), so the process waits forever.
- Fix both sides:
  1. A view command whose default export returns a thenable when called as a
     component: decide Raycast-compatible behaviour (check how Raycast's API
     docs describe view vs no-view entry points; if unclear, treat the
     returned promise like a no-view command body — run to completion with
     feedback mounted — and record the choice in decision 0004 or 0001).
  2. Feedback promises (`showToast`, `Toast.show/hide`, `showHUD`,
     `closeMainWindow`) must settle even when no commit happens (e.g. resolve
     after the next publish or a microtask flush when nothing is mounted).
     Add a regression test that would hang without the fix, with a test
     timeout.
- `updateCommandMetadata({ subtitle? })` (declarations in
  `compat/raycast-api/index.d.ts`) → capability `command.metadata`
  (record/print in CLI; granted by default in the headless defaults
  `packages/host/src/headless.ts` since it only affects Blast's own UI).
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Another worker (0031) is moving enum definitions into
  the generator and will touch imports in `feedback.ts`; keep your
  `feedback.ts` changes focused so the merge stays simple.

## Acceptance

- [ ] Regression tests for the hang (async view default export; feedback with
      nothing mounted) pass within a short timeout.
- [ ] `blast run <one-thing> set-one-thing --argument oneThing=x` exits on its
      own (document the command used in Handoff; corpus via `corpus:fetch
      --extension one-thing`).
- [ ] `bun run verify` passes.

## Out of scope

- Real window/metadata UI.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
