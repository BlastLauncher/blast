---
id: "0091"
title: Sandboxed corpus sweep runner with a pilot run
status: doing
milestone: M6
depends: ["0090", "0093"]
---

## Goal

`bun run corpus:sweep` runs commands from every extension Blast can serve
without installing dependencies, safely and within a disk budget, and reports
failures ranked by cause. A 100-extension pilot proves it and sizes a full run.

## Context

Curated runs cover about 105 of 3,443 extensions. Population here: extensions
_satisfied_ by shared dependencies per `compat/dependencies.json`, 1,939 of 3,493 since 0093 (semver-aware)
at the last scan. Never install dependencies.

Reuse `scripts/corpus/batch.ts`, `smoke-command.ts`, `smoke.ts` (outcomes,
placeholder inputs, deny-all broker) instead of forking them.

**Containment is a hard requirement.** This executes unreviewed-by-us third
party code at a scale the curated runs did not. Every extension child must run:

- under `sandbox-exec` on macOS (and refuse to run elsewhere unless given an
  explicit `--unsandboxed`) with network denied, no reads of credential and
  personal paths (`~/.ssh`, `~/.aws`, `~/.config`, `~/.gnupg`, `~/.npmrc`,
  `~/Library/Keychains`, `~/Library/Application Support`, `~/Documents`,
  `~/Desktop`), and writes confined to a per-run scratch directory;
- with an allowlisted environment, so no tokens are inherited, and `HOME` and
  `XDG_*` pointing into the scratch directory.

With no network, data-driven commands should still reach a first scene
(usually a loading list). The report must distinguish those, and "rendered" must
not imply a working command.

**Disk.** The volume is 93% full. Fetch in budget-sized batches and delete each
batch's extension sources and bundle output before fetching the next. Per-run
scratch is deleted as extensions finish. The sweep aborts cleanly if free space
falls under 20 GB or the budget is exceeded.

Options: `--limit N`, `--seed S` (deterministic selection), `--jobs N`,
`--resume`. Append per-command results to `.cache/sweep/results.jsonl`, so an
interrupted run resumes and its log survives. The log is not committed.

Commit only aggregates: `compat/SWEEP.md` (at most 300 lines) and
`compat/sweep.json` (at most 200 KB, no per-command rows). Report outcome
totals, failure causes grouped by normalised message and ranked by commands
affected, and unsupported or denied capabilities ranked likewise.

## Acceptance

- [ ] A fixture test proves that a child cannot read a planted file under a
      denied path, cannot open an outbound connection, and cannot write outside
      scratch. These run only on macOS, are deterministic, and use no network.
- [ ] A fixture test proves the child sees no variable outside the allowlist.
- [ ] Pure logic (selection, resume, grouping, report size limits) has tests.
- [ ] Killing a pilot midway and rerunning with `--resume` does not repeat
      finished commands, demonstrated in Handoff.
- [ ] Pilot of `--limit 100` committed. Handoff gives commands per minute, peak
      disk, and the projected duration and peak of a full run.
- [ ] `.cache` is left under 150 MB.
- [ ] `bun run verify` passes.

## Out of scope

- The full run (written as a task after the pilot) and dispatching actions (0092).
- Fixing any failure the sweep finds.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
