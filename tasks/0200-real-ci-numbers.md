---
id: "0200"
title: Replace estimated CI and release numbers with measured ones
status: doing
milestone: M18
depends: ["0198"]
---

## Goal

`docs/performance.md`'s CI-and-release table shows measured after numbers, not estimates.

## Context

- Task 0198 recorded CI "after" numbers as estimates because workers cannot push.
- Measured since: PR #124 CI run `45931144441` (every job ran, because the PR changed
  the workflows), `main` CI run `45931305646`, and `main` prerelease run `45931305521`.

## Acceptance

- [ ] No "est." left in the CI-and-release table; each after number cites its run.
- [ ] `bun run verify` passes.

## Out of scope

- Any workflow or code change.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/0200-ci-numbers
Verify: run by tasks:merge
Done:
- Measured after numbers from PR #124 and the first `main` CI and prerelease runs.
- PLAN.md: M18 marked done in Current focus.
Not done / risks: one sample per number; later runs will vary.
```
