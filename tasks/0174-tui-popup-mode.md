---
id: "0174"
title: "TUI popup mode: several extension dirs, exit on close, start-up time"
status: doing
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

- [x] Tests: two fixture extensions in one root; `--popup` exits after a
      `closeMainWindow` command, after a no-view command, and on root Esc;
      without `--popup` Esc still returns to the root.
- [x] Handoff: cold and warm start-up numbers, before and after any fix.
- [x] `docs/tui.md` documents the new arguments; `bun run verify` passes.

## Out of scope

- The tmux extension, publishing, the tmux plugin.

## Handoff

```
Branch/commit: t3/tui-popup-mode @ ef488db
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 136.2s
Done:
- blast-tui [--popup] [--native] <extensionDir>...: one engine root over every
  dir (cli.ts, tested); <dir> <command> still opens one command when the
  second argument is not a directory.
- --popup quits (exit 0) on closeMainWindow(), after a no-view command's HUD,
  and on Esc at the root; App.onClose takes only scene-driven quits and
  settled no-view commands, so Esc in a command still returns (popup.test.tsx).
- Start-up (scripts/tui-benchmark.ts, fresh processes, median of 5, root /
  launched hello-list command):
  before: cold 274 / 580 ms, warm 278 / 585 ms (warm rebuilt every bundle)
  after:  cold 225 / 582 ms, warm 224 / 378 ms
- Fixes: bundles cached in <dataDir>/bundles/ (bundle-cache.ts: one slot per
  command, key = manifest, aliases, install status, bundler; inputs checked
  by size + mtimeNs); runtime child gets NODE_COMPILE_CACHE in
  <dataDir>/compile-cache/ (~300 -> ~90 ms runtime load); Bun's Node
  builtin list is computed lazily (a 60 ms node spawn on every import).
- Docs: tui.md (arguments, popup, numbers), architecture.md (caches).
Not done / risks:
- Behaviour change for every engine client: extension launches no longer
  delete their build on close (extension.test.ts updated). A stale slot is
  replaced in full, so a session still running an old build of the same
  command loses its assets link if the source changed and it was relaunched
  at the same time. Slots are never pruned when an extension goes away.
- An explicit StartOptions.env opts out of the compile cache.
- Cold launches are unchanged (the caches are written on the first run);
  root start-up is now mostly module loading (OpenTUI ~85 ms).
- Smoke-tested in a real isolated tmux server (tmux -L): popup Esc exits 0.
```
