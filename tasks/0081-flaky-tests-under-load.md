---
id: "0081"
title: Make child-process and TUI frame tests robust under load
status: doing
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
