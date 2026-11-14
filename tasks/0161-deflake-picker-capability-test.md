---
id: "0161"
title: Make the TUI picker capability-handler test deterministic
status: doing
milestone: M9
depends: []
---

## Goal

`picker passes custom capability handlers to launched commands`
(`packages/tui/src/picker.test.tsx`) passes reliably under full-suite load.

## Context

- Three separate workers saw it time out in full `bun run verify` runs
  under load. It always passes alone. It times out waiting for the picker
  state after the `Copy apple` action renders.
- AGENTS.md: deterministic, order-independent tests. Earlier fixes in this
  repo replaced wall-clock waits with polling short `act()` ticks until a
  condition holds, and never `await` a promise inside one `act()` that only
  resolves via a passive effect. Find the wait that depends on timing and
  replace it with condition-based waiting; raise a per-test timeout only if
  the work is genuinely slow (say why in Handoff).
- Reproduce under load: run `bun test --randomize packages/` 5 times in a row,
  in parallel with a second `bun test packages/tui` loop.

## Acceptance

- [ ] Handoff names the root cause (the exact wait/race).
- [ ] 10 consecutive `bun test --randomize packages/tui` runs under the load
      loop above pass (summary in Handoff).
- [ ] `bun run verify` passes.

## Out of scope

- Changing picker behaviour; other tests unless they share the same helper.

## Handoff

```
Branch/commit: t3/deflake-picker-capability-test @ 76b3406
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 157.8s
Done:
- Root cause: the test waited for the frame to contain "Copy", but the App
  footer always ends with "· ^C Copy" (app.tsx). That predicate was already
  true on the command's first, empty loading frame, so the second Enter ran
  against a view with no selected action and was lost. The command scene then
  painted "Copy apple", but no further Enter came and the final settle timed
  out after 15s. It only passed when the scene won the race with the press.
- Wait for the action's own title ("Copy apple") instead, which the footer gets
  from the scene's selected action; the controller already holds that action
  when the frame paints, so the press no longer races.
- Failure reproduced reliably before the fix (4/10 focused runs) with five
  parallel full-suite loads; after the fix, 10 consecutive
  `bun test --randomize packages/tui` runs passed under the prescribed load
  (5 sequential `bun test --randomize packages/` runs in parallel with a
  `bun test packages/tui` loop): 64 pass / 0 fail each, 24-35s.
Not done / risks: An extreme load of five simultaneous full-suite runs still
times out unrelated tests (app.test resize, look.test dropdown, engine
tests) that are outside this task's scope; this test itself passed every run.
```
