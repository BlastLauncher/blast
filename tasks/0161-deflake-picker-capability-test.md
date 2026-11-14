---
id: "0161"
title: Make the TUI picker capability-handler test deterministic
status: todo
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
