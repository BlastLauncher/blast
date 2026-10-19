---
id: "0057"
title: TUI corpus smoke run over the curated commands
status: review
milestone: M4
depends: []
---

## Goal

`bun run corpus:tui-smoke` runs every curated corpus command through the TUI
`App` in OpenTUI's test renderer and writes `compat/tui-smoke.json` and
`compat/TUI-SMOKE.md`. The report shows which real commands render in the TUI
and which break in client code.

## Context

- `scripts/corpus/smoke-run.ts` is the headless smoke. It fetches curated
  extensions in batches (`fetchBatch`), runs each manifest command, then drops
  the checkout. Reuse its batching, path sanitising and report helpers
  (`scripts/corpus/smoke.ts`) by importing or extracting them. Do not copy them.
- The TUI: `packages/tui/src/session.ts` `openCommand`, `app.tsx` `App`.
  Tests use `testRender` from `@opentui/react/test-utils`; see
  `packages/tui/src/app.test.tsx` for `waitForFrame`, `mockInput` and
  `captureCharFrame`. The script runs on Bun. Use a fixed size, e.g. 100×30.
- Per command, in order:
  1. Commands with required arguments are reported `missing-arguments`, as
     in the headless smoke.
  2. Open the command with the headless defaults the CLI smoke uses (the
     broker and preference defaults are in `smoke-run.ts`). Render the `App`.
  3. Wait up to 5 s for a frame that differs from the initial empty frame,
     or for an exit.
  4. Then press ↓, Ctrl-K, Esc. Capture the frame after each key.
- Outcomes:

  | Outcome        | Meaning                                                                                                     |
  | -------------- | ----------------------------------------------------------------------------------------------------------- |
  | `rendered`     | Frame has visible text, and no keypress threw.                                                              |
  | `placeholder`  | The frame contains the TUI's unknown-node placeholder; record which node types.                             |
  | `client-error` | An exception was thrown in TUI code, either during render or on a key. Record a sanitised message.          |
  | `empty`        | A scene arrived but the frame has no text.                                                                  |
  | Host outcomes  | Same names as the headless smoke when no scene arrives: `crashed`, `timeout`, `bundle-failed`, `completed`. |

- The report includes one sanitised, truncated frame excerpt (≤ 3 lines) per
  non-`rendered` command, so failures can be triaged without rerunning.
- Disk: same `BLAST_CORPUS_MAX_MB` batching as `corpus:smoke`. Leave the
  checkout manifest-only at the end.

## Acceptance

- [ ] `bun run corpus:tui-smoke` completes over all 200 curated commands and
      writes both report files. Commit the generated files.
- [ ] The Markdown report starts with totals per outcome. Below that, a table
      lists every command with columns mode, outcome and detail, in the
      format of `compat/SMOKE.md`.
- [ ] Pure helpers (classification, frame excerpt, placeholder detection)
      have unit tests that do not touch the network or the corpus.
- [ ] No absolute or home paths in the committed reports. Check with
      `grep -n "/home/\|/tmp/" compat/TUI-SMOKE.md compat/tui-smoke.json`,
      which must print nothing.
- [ ] Handoff lists the `client-error`, `placeholder` and `empty` commands with
      their probable cause. They are follow-up tasks, not fixes here.
- [ ] `bun run verify` passes.

## Out of scope

- Fixing TUI or shim bugs found by the run. Exception: a one-line crash
  that blocks the run itself.
- Installing extension dependencies (decision 0008 keeps corpus tooling
  allowlist-only).
- Adding the run to `bun run verify` or CI. It needs the network.

## Handoff

```
Branch/commit: t3/tui-corpus-smoke (feat bebd077, handoff on top)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 68.7s
Done:
- `bun run corpus:tui-smoke` (`scripts/corpus/tui-smoke-run.ts`) renders every manifest
  command of the 80 curated extensions in the TUI `App` through OpenTUI's test renderer at
  100x30, on the headless smoke's deny-all broker and manifest preference defaults, then
  presses ↓, Ctrl-K and Esc with the frame captured after each key. One run takes ~2 min and
  leaves `.cache` manifest-only (peak 450 MB at `BLAST_CORPUS_MAX_MB=600`).
- `scripts/corpus/tui-smoke.ts` (pure) classifies the scene's frame as `rendered`,
  `placeholder` (recording the node types), `client-error` (React's caught error or
  OpenTUI's `[KeyHandler]` log, read back out of `console.error`) or `empty`, and delegates a
  command without a frame to the headless rules; it renders `compat/tui-smoke.json` and
  `compat/TUI-SMOKE.md` (totals first, then the `compat/SMOKE.md`-format table, then every
  non-rendered command with a ≤3-line sanitized frame excerpt).
- Shared helpers extracted instead of copied: `scripts/corpus/batch.ts` (the batching both
  smoke runners use) and `smoke.ts`'s `exitProbe`; `smoke-run.ts` now imports both.
- Committed reports: 200 commands — rendered 184, completed 1, capability-denied 7,
  crashed 3, missing-arguments 5. Every command's outcome, node count and root type matches
  `compat/SMOKE.md` exactly, so the TUI addition changes nothing in the host taxonomy.
- 13 offline unit tests (`scripts/corpus/tui-smoke.test.ts`) cover the classification
  precedence, placeholder extraction, frame lines/excerpts, the `console.error` rule, totals
  and both renderers. The run itself needs the network and stays out of `verify`.
- Reproducible: two full runs write byte-identical reports. The markdown goes through
  `oxfmt` before it is written (like `scripts/compat/generate-enums.ts`), so regenerating
  leaves the working tree clean.
Not done / risks:
- Nothing landed in `client-error`, `placeholder` or `empty`, so there is no follow-up task
  to hand over, and the buckets are not dead code:
  - `placeholder` needs a scene node the TUI cannot render. The curated set is List-centric
    and `view.ts` never visits `List.Item` children (accessories are invisible), so none of
    the 184 frames printed `[Unsupported: …]`. Checked out of band: a scene with a
    `List.ItemAccessory` child does print the placeholder and the detector extracts it; a
    Form/Grid-heavy curated set would exercise the path.
  - `client-error` needs a throw in TUI code; the only throws are `session.ts`'s client
    handlers, which the headless broker never calls.
  - `empty` needs a scene whose frame has no text, which the App's own chrome (title, search
    box, footer) prevents; it stays a defensive outcome, unit-tested only.
- The outcome comes from the first scene with a root, exactly as the headless smoke: a
  command that draws a scene and then dies (`chakra-ui-docs/components`) is `rendered`, with
  the runtime's error box in its later frames. `humaans/holidays`, `humaans/people` and
  `parcel/my-deliveries` die before any root-ful scene and are `crashed` with the runtime's
  message and log line, matching `compat/SMOKE.md`.
- Root `devDependencies` gained `@opentui/core` 0.6.6, `@opentui/react` 0.6.6, `react`
  19.3.1 and `@types/react` 19.3.0: exactly the versions `packages/tui` already pins, so
  `bun` links the single existing `.bun/` copies — `packages/tui/node_modules/*` still
  resolve to the same directories, one React instance. They are needed because the corpus
  script reaches the test renderer from `scripts/`, which resolves `node_modules` outside
  `packages/tui`.
- `bun test --randomize` is flaky for the TUI slice under CPU load: with two busy processes
  the *unmodified* `f7d5b17` fails the same "Timed out waiting for frame predicate after 20
  passes" tests, so the failures seen while building this happened when the sibling
  worktrees were running `bun test` too. On a quiet machine `bun run verify` passes; worth a
  separate task if verify keeps flaking under load.
```
