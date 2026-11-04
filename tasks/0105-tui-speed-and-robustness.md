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
Branch/commit:
Verify:
Done:
Not done / risks:
```
