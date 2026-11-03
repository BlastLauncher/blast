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
Branch/commit: t3-13fdfcab @ 1e6c685 (triage in progress; Handoff will be updated)
Verify: not run yet
Done:
- Merged `t3/full-corpus-sweep-triage`; the committed report covers 1,939 extensions and 5,759 commands.
- Report totals: 4,879 rendered, 27 completed, 451 capability-denied, 59 sandbox-denied, 170 bundle-failed, 157 crashed, 14 network, 2 unsupported-api. Render crash rate is 157/5,759 (2.7%); dispatched primary-action crash rate is 3/1,358 (0.2%).
- The run was resumed for 5,443 commands. Its 227 s wall time, 1,523.17 commands/min, 1,498.6 MB peak and projected-full-population values are not meaningful as whole-run measurements; the report should label resumed-run timing/projection as partial/invalid and compute metrics only from a fresh run (or record per-batch timings).
- Preliminary triage: `storage.get` 266 + `storage.all` 13 + `storage.set` 8 + `storage.remove` 4 are expected headless consequences in this sweep. `packages/host/src/storage.ts:170-195` provides the handlers, while the sweep launch path uses `createHeadlessHandlers` without merging storage (`scripts/corpus/smoke-command.ts:6-20`, `packages/cli/src/cli.ts:620-647`); the default CLI deliberately grants storage via `createSessionBroker`, but the sweep does not. Proposed fix: give the sweep an isolated per-command in-memory storage handler (or explicitly document the denial as a sweep limitation), without changing the sandbox.
- Preliminary triage: `open.url` 117 and `oauth.tokens.get` 15 are expected headless consequences. `createHeadlessHandlers` intentionally has no `open.url` handler (`packages/cli/src/headless.ts:94-115`) and OAuth token reads are denied by the broker unless an embedder supplies them (`packages/host/src/oauth.ts`); proposed fix: expected/optionally add explicit synthetic handlers only for a separately configured headless fixture.
- Preliminary triage: the 85 async Client Component crashes are a React/reconciler compatibility issue to investigate next; the custom reconciler mounts through `updateContainerSync` and `flushSyncWork` (`packages/runtime/src/reconciler/index.ts:199-220`).
Not done / risks: source-line evidence for extension failures and remaining causes, plus final verify, still pending.
```
