---
id: "0081"
title: Make child-process and TUI frame tests robust under load
status: review
milestone: M5
depends: []
---

## Goal

`bun run verify` stops failing intermittently when the machine is busy.
Several workers saw the same flakes recently; a rerun always passed.

## Context

- Reported flakes (seeds from handoffs):
  - `packages/tui/src/actions-variants*.test.tsx` "frame timeout" (seeds
    `2181236663`, `2509153097`);
  - `packages/cli/src/cli.test.ts` cases with 5 s budgets, timing out under
    parallel load;
  - one unknown failure on the merged tree that passed on rerun.
- Each test spawns a real Node runtime (bundle + child process). Fixed
  wall-clock budgets (`--timeout 800/1500/3000/5000`, `settle()` deadlines,
  `waitForFrame` loops, bun's default per-test 5 s timeout) are the likely
  causes.
- Approach:
  1. Reproduce: run `bun test --randomize --seed=<seed>` for the seeds above
     while loading the CPU, e.g. two parallel `bun test` runs, or
     `stress-ng`-free loops such as `yes > /dev/null &` × cores, killed
     afterwards. Record what times out.
  2. Fix causes, not symptoms:
     - wait on events (scene/exit) instead of polling deadlines where
       possible;
     - share one bundle per fixture across a file's tests where the test
       does not need isolation;
     - raise only the budgets that guard against hangs, not ones that assert
       behaviour (e.g. the `--timeout` exit-3 test must stay fast but
       deterministic);
     - set explicit per-test timeouts for the slow child-process tests
       (`test(name, fn, 20_000)`) rather than a global increase.
  3. Keep tests deterministic and order-independent (AGENTS.md).
- Do not change product behaviour. If a real race in product code shows up,
  stop and describe it in Handoff instead of patching around it.

## Acceptance

- [ ] Handoff lists each flake reproduced, its cause, and the fix.
- [ ] Under the load recipe, five consecutive full `bun test --randomize` runs
      pass. Paste the seeds and results.
- [ ] `bun run verify` passes; total test time does not grow by more than 20%
      (before → after in Handoff).

## Out of scope

- Product changes, new features, CI configuration.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/fix-flaky-tests-under-load @ 7cafb28
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 92.7s
Done:
- Reproduced the CLI flakes under load: `packages/cli/src/cli.test.ts` spawns a
  Node child per case, so several cases exceeded bun's 5 s default; the same
  cases also raced their own `--timeout 3000/5000` guards. Gave every case an
  explicit 30_000 ms test budget and raised hang-only CLI guards to 20_000 ms.
  The `--timeout 800` behaviour test keeps 800 ms and still asserts "timed out
  after 800ms".
- Reproduced the "frame timeout" in `packages/tui/src/app.test.tsx`
  (actions-variants under two competing full runs). OpenTUI's `waitForFrame`
  stops after 20 passes; wrapped it with `maxPasses: 500` in a shared
  `test-support.ts` helper (it still stops early when the renderer is idle).
- Moved the duplicated 3 s `waitScene`/`frameEventually`/`settle` helpers into
  `packages/tui/src/test-support.ts` with 15 s hang guards, retrying
  `captureCharFrame` when the native buffer lease reports `OutputBusy`.
- Made the actions-variants case wait on scene events (submenu `onOpen`, search
  forwarding) instead of inferring panel state from frames, so a late commit
  can no longer send the typed text to the list search. Added 30_000 ms test
  budgets to every TUI case that launches a real command, and raised the
  install-dependencies child-process case from 15 s to 30 s.
- Load recipe: six `yes` burners plus two parallel full `bun test --randomize`
  runs. Five consecutive rounds, all 680/680 pass:
  3857439134 & 4223802; 3423864777 & 3152931786; 3024503293 & 1375505730;
  2897258220 & 354465590; 3415073283 & 317822781.
- Total test time before 109.38 s, after 90.95 s (single unloaded
  `bun test --randomize`); loaded runs are slower by design.
Not done / risks:
- `packages/tui/src/app.test.tsx` previously asserted that the actions-variants
  submenu client-filters "red" down to Red. The scene has
  `onSearchTextChange`, and `filteringOf` in `client-core` treats that as
  extension-owned search, so the client deliberately shows every action; the
  old assertion only passed by accident once "picked Red" appeared in the
  title. The test now asserts the real contract instead: the search text is
  forwarded to the extension. If Raycast semantics are that `filtering` still
  applies alongside `onSearchTextChange`, that is a product fix outside this
  task (do not change product behaviour here).
- `test-support.ts` swallows `OutputBusy` from OpenTUI's native frame capture
  and retries on the next poll. That is a test-renderer lease race, not Blast
  code, but it means a frame can be sampled one poll later under heavy load.
```
