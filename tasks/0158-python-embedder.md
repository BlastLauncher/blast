---
id: "0158"
title: "Minimal Python embedder (stdlib, ≤ 200 lines); Go example on the new flow"
status: todo
milestone: M9
depends: ["0157"]
---

## Goal

Prove decision 0014 point 5: a complete embedder in a non-JS language, using
only its standard library, fits in ≤ 200 lines and supports root search,
launch prompts, actions and one capability.

## Context

- New `examples/python-embedder/` (`embedder.py`, `test_embedder.py`,
  `README.md`): spawns `blast serve` (path flag like the Go example), sends
  `hello` with views, opens extension dirs given on the command line, opens
  the root view (0156), prints the view as text, maps terminal keys to
  `root.input`/`session.input`, answers `clipboard.copy` by printing.
  Python 3.10+ stdlib only (`subprocess`, `json`, `threading`). Tests use
  `unittest` against the real server and `fixtures/extensions/hello-list`,
  and cover: handshake, root search, launch, a prompt form (use the 0157
  fixture), primary action, clipboard round trip, shutdown.
- Add `bun run example:python` (skips with a clear message when `python3` is
  absent) and a CI step in `.github/workflows/ci.yml` next to the Go one.
- Shrink `examples/go-embedder/main.go` the same way: root view + prompts,
  drop now-unneeded client logic. Report before/after line counts.
- Run Python with `python3 -I` in scripts.

## Acceptance

- [ ] `wc -l examples/python-embedder/embedder.py` ≤ 200 (excluding tests).
- [ ] `bun run example:python` passes locally; CI workflow runs it.
- [ ] `bun run example:go` passes; Handoff gives Go before/after line counts.
- [ ] `bun run verify` passes.

## Out of scope

- Publishing a Python package; GUI toolkits; engine changes (report gaps in
  Handoff instead).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
