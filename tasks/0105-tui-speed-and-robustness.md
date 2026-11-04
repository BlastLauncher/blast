---
id: "0105"
title: TUI speed and robustness
status: doing
milestone: M6
depends: ["0104"]
---

## Goal

The TUI starts quickly, stays responsive with very large lists, survives
terminal resizes and runtime crashes, and works in limited-colour terminals.

## Context

Scope agreed with the owner on 2026-11-04. None of this is measured today.
Measure first, then fix what the numbers show.

## Acceptance

- [ ] A benchmark script (not part of `verify`) reports time to first frame
      for the `hello-list` fixture and keystroke latency on a 10,000-item list;
      Handoff gives before and after numbers.
- [ ] Rendering a 10,000-item list draws only visible rows (or an equivalent
      bound) and keeps selection and filtering correct; tested.
- [ ] Resizing the terminal re-lays out List, Grid, Detail and Form without
      losing selection or input; tested with the test renderer.
- [ ] A runtime crash shows the error and offers relaunch or back, instead of
      leaving the client stuck; tested.
- [ ] `NO_COLOR`, 16-colour and 256-colour terminals stay readable (selection
      and errors distinguishable without colour); tested.
- [ ] `bun run verify` passes.

## Out of scope

- Launcher features; protocol changes.

## Handoff

```
Branch/commit: t3/tui-speed-robustness @ f9ba16f (implementation; Handoff update follows in this commit)
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 53.2s; `NO_COLOR=1 bun run verify` also passed with the same summary.
Done:
- Added a terminal-side visible row window, preserving complete client-core filtering and selection semantics; 10,000-item rendering and resize coverage are in `virtualization.test.tsx` and `resize.test.tsx`.
- Added resize-driven layout coverage for List, Grid, Detail and Form, including preserved selection and form input.
- Runtime failures now offer relaunch or back; picker relaunches the same command and arguments, with end-to-end coverage.
- Added injectable colour palettes and tests for colourless/coloured readability, plus `scripts/tui-benchmark.ts` and its `docs/tui.md` usage note.
- Benchmark: before (renderer-only baseline) 32.0 ms first frame / 74.9 ms mean key latency; after 38.4 ms / 16.1 ms in the same harness. The checked-in benchmark includes launch startup: 155.03 ms `hello-list` first frame / 14.53 ms mean latency on this machine.
Not done / risks: Benchmark timings are machine-dependent; no protocol or launcher changes.
```
