---
id: "0094"
title: Run the full corpus sweep and triage its failures
status: doing
milestone: M6
depends: ["0091", "0092"]
---

## Goal

`compat/SWEEP.md` reports the whole satisfied population (1,939 extensions)
with the primary action probe, and the top failure causes are traced to a root
cause, so the orchestrator can write fix tasks.

## Context

The 100-extension pilot projects about 30 minutes and a 450 MB `.cache` peak
for the full run. Run
`bun run corpus:sweep --seed 0091 --jobs 4 --probe-actions` with no `--limit`.
Use `--resume` if it is interrupted; the log in `.cache/sweep/results.jsonl`
makes that safe.

In the pilot, 7 of 10 crashes were "Cannot convert undefined or null to
object", and they only appeared once the probe waited for loading to finish.
That looks like a Blast API returning `undefined` where Raycast returns an
object. Find which API.

Triage means reading code, not fixing it: for each cause, decide whether it is
a Blast bug (name the API and file), an extension bug, an expected consequence
of the headless broker or sandbox (no network, denied capabilities, no shell),
or a dependency mismatch (0093 rules).

## Acceptance

- [ ] Full run committed: `compat/SWEEP.md` and `compat/sweep.json`, within
      their size limits and with 0091 redaction.
- [ ] Handoff gives outcome totals, both crash rates with denominators, wall
      time and peak `.cache`.
- [ ] Handoff has a table of the top 10 failure causes by commands affected,
      each with its category, evidence (file:line in Blast, or the extension
      and its source line) and a one-line proposed fix or "expected".
- [ ] The "Cannot convert undefined or null to object" crash is traced to the
      Blast API and the Raycast behaviour it should match.
- [ ] `.cache` is left under 150 MB. `bun run verify` passes.

## Out of scope

- Fixing anything the sweep finds; changing the sandbox, broker or selection.
- Installing extension dependencies or running with network access.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
