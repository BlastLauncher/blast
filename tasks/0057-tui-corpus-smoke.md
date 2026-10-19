---
id: "0057"
title: TUI corpus smoke run over the curated commands
status: doing
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
