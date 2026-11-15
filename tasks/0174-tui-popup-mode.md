---
id: "0174"
title: "TUI popup mode: several extension dirs, exit on close, start-up time"
status: todo
milestone: M11
depends: []
---

## Goal

`bun packages/tui/src/main.tsx --popup <dirA> <dirB>` opens one root view
over every given extension and exits as soon as a command is done, so it can
run inside `tmux display-popup -E`. Cold and warm start-up times are measured
and the warm path is fast.

## Context

- Decision 0016 points 1 and 3. Entry: `packages/tui/src/main.tsx` (today one
  `<extensionDir> [command]`), `launcher.tsx` (`engine.root` over one
  `openExtension`). `engine.root` already lists every opened extension.
- New CLI: `blast-tui [--popup] [--native] <extensionDir>...`. Keep
  `<extensionDir> <command>` as it is when exactly one dir plus a command name
  is given (a command name is not an existing directory).
- `--popup`: quit (exit 0) when a launched command requests
  `closeMainWindow` (scene `Navigation.props.closeMainWindow`), when a no-view
  command finishes after its HUD, and on Esc at the root. Without `--popup`,
  behaviour is unchanged (return to root).
- Start-up: measure time to the first root frame and to a launched command's
  first frame, cold (empty data dir) and warm, with `scripts/tui-benchmark.ts`
  style in-memory rendering. Bundles must be reused across runs (check the
  host's bundle cache under the data dir); fix any per-run rebuild. Report
  numbers in Handoff and `docs/tui.md`.

## Acceptance

- [ ] Tests: two fixture extensions in one root; `--popup` exits after a
      `closeMainWindow` command, after a no-view command, and on root Esc;
      without `--popup` Esc still returns to the root.
- [ ] Handoff: cold and warm start-up numbers, before and after any fix.
- [ ] `docs/tui.md` documents the new arguments; `bun run verify` passes.

## Out of scope

- The tmux extension, publishing, the tmux plugin.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
