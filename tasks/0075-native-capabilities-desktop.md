---
id: "0075"
title: "@blastlauncher/native II: applications, frontmost app, selection, windows"
status: doing
milestone: M5
depends: ["0074"]
---

## Goal

`createNativeHandlers()` also answers the desktop-introspection capabilities
on macOS, Windows and Linux, so extensions using `getApplications`,
`getFrontmostApplication`, `getSelectedText`, `getSelectedFinderItems` and
`WindowManagement` work in embedders that register the native package.

## Context

- Decision `docs/decisions/0010` (point 4). Existing package:
  `packages/native/src/index.ts`, with its injectable `run` and the
  fake-runner test style in `index.test.ts`. Follow it exactly.
- Capabilities and their wire shapes: the catalog in
  `packages/protocol/src/capabilities.ts` (`applications.list`,
  `applications.default`, `applications.frontmost`, `selection.text`,
  `selection.files`, `window.desktops`, `window.list`, `window.active`,
  `window.setBounds`). The CLI's neutral answers in
  `packages/cli/src/headless.ts` show the expected result shapes
  (`Application`: `name`, `path`, `bundleId?`, `localizedName?`,
  `windowsAppId?`).
- Suggested tools; verify before relying on them:
  - **macOS:**
    - `mdfind kMDItemContentType == 'com.apple.application-bundle'` plus
      `mdls`, or JXA, for applications; `defaults`/LaunchServices via JXA for
      the default app;
    - JXA System Events for the frontmost app and window
      list/bounds/desktops;
    - selection: JXA Finder selection for files; selected text via a
      clipboard round trip (save clipboard, ⌘C, read, restore) with a
      documented caveat.
  - **Windows:** PowerShell (`Get-StartApps`, registry App Paths,
    `Get-Process` + `MainWindowHandle`, `user32` via `Add-Type` for window
    bounds, `IApplicationActivationManager` not required). Selection: the
    clipboard round trip with Ctrl+C. Files: the Explorer shell COM selection.
  - **Linux:**
    - `.desktop` files from `$XDG_DATA_DIRS`/`~/.local/share/applications`
      parsed in-process (no tool), and `xdg-mime query default` for the
      default app;
    - X11: `xdotool`/`xprop`/`wmctrl` for the frontmost app and windows;
      Wayland: deny window ops with a clear "not available on Wayland"
      message, except where a portal or tool exists;
    - selection: `wl-paste --primary` or `xclip -selection primary -o` for
      the text; file selection is unsupported (clear error).
- Unsupported combinations fail with `"<capability> is not supported on <platform>[/<session>]: <reason>"`.
  Never return fake data. The CLI's headless answers stay the neutral option.
- Keep `index.ts` readable: split per area (`applications.ts`,
  `selection.ts`, `windows.ts`) if it grows beyond about 400 lines.

## Acceptance

- [ ] Fake-runner tests per platform for every capability above, including
      the unsupported/Wayland error paths and `.desktop` parsing (fixtures
      under the test's temp dir).
- [ ] `rg -n "exec\\(|shell: true" packages/native/src` prints nothing.
- [ ] Handoff lists what was manually smoke-tested on this Linux host.
- [ ] `bun run verify` passes.

## Out of scope

- Engine, CLI or TUI changes beyond docs/capabilities.md notes. Native addons.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
