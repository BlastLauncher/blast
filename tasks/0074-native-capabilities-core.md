---
id: "0074"
title: "@blastlauncher/native I: clipboard, open, file manager, trash on macOS/Windows/Linux"
status: doing
milestone: M5
depends: []
---

## Goal

An optional package gives embedders working native handlers for the most
common capabilities on macOS, Windows and Linux. They register it with one
call. The engine itself stays platform-free.

## Context

- Decision `docs/decisions/0010` (points 1, 4, 5). Read it first, then
  `docs/capabilities.md`.
- Capability names and params come from the runtime call sites
  (`requestCapability(...)` under `packages/runtime/src/api/`). Implement:
  - `clipboard.copy`, `clipboard.paste`, `clipboard.read`, `clipboard.clear`,
    with params shaped as in `packages/runtime/src/api/clipboard.ts` (text,
    html, file). `clipboard.read` with a nonzero history offset returns
    `{ text: "" }`, because no OS exposes history. `clipboard.paste` copies,
    then sends the platform paste keystroke where possible
    (`osascript` System Events / PowerShell SendKeys / `wtype` or `xdotool`).
    If that is impossible it fails with a clear message.
  - `open.url`, `open.path` (with optional application);
  - `finder.show`;
  - `trash` (paths).
- New package `packages/native` (`@blastlauncher/native`, private, ESM,
  `exports` `./src/index.ts`) depending only on `@blastlauncher/protocol`.
  Export `createNativeHandlers({ platform?, run?, env? })`. It returns a
  `Record<string, handler>`, where a handler has the same shape as host's
  `CapabilityHandler` (`(params, context) => JsonValue | void | Promise<…>`).
  Define that type locally; do not import host.
- Platform detection: `process.platform`; on Linux use `WAYLAND_DISPLAY` vs
  `DISPLAY` to pick the tools. Tools by platform:
  - macOS: `pbcopy`/`pbpaste`, `osascript` for HTML/file clipboard,
    `open`, `open -R`, Finder trash via `osascript`;
  - Windows: PowerShell `Set-Clipboard`/`Get-Clipboard`, `Start-Process`,
    `explorer /select,`, recycle bin via
    `Microsoft.VisualBasic.FileIO.FileSystem`;
  - Linux: `wl-copy`/`wl-paste` or `xclip`/`xsel`, `xdg-open`,
    `gio open`/`dbus-send` FileManager1 `ShowItems` (fallback: open the
    parent directory), `gio trash`.
- All process execution goes through an injectable
  `run(command, args, { input? }) => Promise<{ stdout, code }>`. The default
  uses `node:child_process` `execFile`, never a shell string, so paths and
  URLs cannot inject commands. A missing tool (ENOENT) fails with
  `"<tool> is required for <capability> on <platform>"`.
- `open.url` accepts only URLs that parse with `new URL` and use a scheme
  other than `javascript:`. `open.path` and `trash` require absolute paths.
- Tests (`packages/native/src/*.test.ts`) use a fake runner and assert the
  exact command and args per platform for every capability, plus the error
  paths: missing tool, invalid URL, relative path. Never run real tools in
  tests.
- Wire it into the TUI as opt-in: `bun run tui <dir> --native` registers these
  handlers instead of the in-memory clipboard and URL recorder. Document the
  flag in `docs/tui.md` (≤ 3 lines) and add a `packages/native` row to the
  Packages table in `docs/architecture.md`.

## Acceptance

- [ ] Per-platform fake-runner tests for each capability listed above,
      including Wayland vs X11 selection and every error case named above.
- [ ] `rg -n "exec\\(|shell: true" packages/native/src` prints nothing.
- [ ] `packages/native` imports nothing from `@blastlauncher/host` or runtime.
- [ ] Handoff states which platforms you smoke-tested manually (Linux is
      available here; say "not tested" for the others).
- [ ] `bun run verify` passes.

## Out of scope

- Applications, frontmost application, selection and window management
  (0075). Clipboard images (`clipboard.png` is not a capability). Native
  addons. Changing host or runtime.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
