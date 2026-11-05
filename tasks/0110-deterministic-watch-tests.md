---
id: "0110"
title: Deterministic manifest-watch tests (inject the watcher)
status: doing
milestone: M7
depends: []
---

## Goal

The manifest-watch tests pass the same way under any load and any seed,
because they no longer depend on real `fs.watch` timing or fixed sleeps.

## Context

A watch test flaked once under full `verify` load (0109 handoff); 12 isolated
randomized runs passed. Causes seen in the code:

- `packages/host/src/extension.ts` (`watch()`, about line 271) calls
  `fs.watch` directly and debounces with a real 100 ms `setTimeout`.
- `packages/host/src/extension.test.ts:67` waits on real file events with a
  2 s timeout, and uses fixed 150 ms sleeps (lines 99, 104) to show that
  nothing arrives after unsubscribe/close.
- `packages/tui/src/picker.test.tsx` uses fixed 300 ms and 150 ms sleeps
  (lines 108, 113, 349) around manifest/lockfile changes.
- `packages/serve/src/main.test.ts:245` drives `blast serve` (a child
  process), so it keeps real files; it waits for `manifest.changed`.

## Acceptance

- [ ] `createExtensionHandle` (and `createEngine`, passing it through) accepts
      an optional watcher factory and an optional debounce scheduler; defaults
      stay `fs.watch` and 100 ms, so behaviour is unchanged.
- [ ] Host and TUI picker tests use a fake watcher that emits events on demand
      and a manual scheduler: no fixed sleeps, no real `fs.watch`. "Nothing
      arrives after unsubscribe/close" is asserted by emitting after
      unsubscribing, not by waiting.
- [ ] Keep exactly one real-filesystem watch test per surface that needs it
      (the serve test), waiting on a condition with a generous timeout instead
      of a fixed sleep; document why it stays real.
- [ ] Evidence in Handoff: the three test files pass 50 consecutive
      `--randomize` runs, and full `bun run verify` passes 3 times in a row
      while another `bun run verify` runs in parallel to add load.
- [ ] `bun run verify` passes.

## Out of scope

- Changing watch semantics (debounce length, which files are watched).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
