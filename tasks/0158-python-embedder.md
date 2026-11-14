---
id: "0158"
title: "Minimal Python embedder (stdlib, ≤ 200 lines); Go example on the new flow"
status: doing
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
Branch/commit: t3/add-python-embedder @ 91ddf28e5729127cbaa669b81fe3fcbe3ad7950a
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok,
mac-fixtures ok, workflow ok, test ok) in 122.7s
Done:
- examples/python-embedder/ (embedder.py 199 lines ≤ 200, test_embedder.py,
  README.md): Python 3.10 stdlib embedder that spawns `blast serve`, says
  hello with views, opens the extension dirs on the command line, drives the
  engine root view (`root.open`/`root.input`, `root.launched`/`session.view`),
  maps terminal keys to `root.input`/`session.input` and answers
  `clipboard.copy` by printing. unittest suite against the real server covers
  handshake, root search, launch (root primary), the 0157 prompt-form fixture
  (engine-handle + required password preference and argument; asserts the
  saved preferences and that the form never echoes the password), primary
  action, clipboard round trip, shutdown and key mapping.
- `bun run example:python` (scripts/example-python.ts) runs the suite with
  `python3 -I` and skips with a clear message when python3 is absent; CI job
  `python-example` (Python 3.10) runs it next to the Go one.
- examples/go-embedder rewritten onto the same engine-owned flow: root view +
  automatic prompts; dropped launch/WaitView/LatestView/ExitStatus client
  logic; main.go 692 → 643 lines; test and README follow; `bun run example:go`
  passes.
- docs/embedding.md and docs/quickstart.md now point at both reference
  embedders.
Not done / risks:
- Engine gaps observed: none blocking; `session.scene` events still arrive
  alongside `session.view` for root-launched sessions (embedders ignore
  unknown events; noted in case 0160 wants them silenced).
- The Python client resolves all pending requests when the server sends a
  protocol `error` (a rejected line never gets a response); the Go client
  does the same after the same hang was found there — behaviour worth
  encoding in the protocol docs if not already there.
```
