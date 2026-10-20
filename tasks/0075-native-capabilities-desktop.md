---
id: "0075"
title: "@blastlauncher/native II: applications, frontmost app, selection, windows"
status: review
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

- [x] Fake-runner tests per platform for every capability above, including
      the unsupported/Wayland error paths and `.desktop` parsing (fixtures
      under the test's temp dir).
- [x] `rg -n "exec\\(|shell: true" packages/native/src` prints nothing.
- [x] Handoff lists what was manually smoke-tested on this Linux host.
- [x] `bun run verify` passes.

## Out of scope

- Engine, CLI or TUI changes beyond docs/capabilities.md notes. Native addons.

## Handoff

```
Branch/commit: t3/native-desktop-capabilities @ d0720f8f9ddd457ec414d74a05a8f169d951b4e7
  (implementation; the following handoff commit is on the same branch)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 130.7s
Done:
- Added all nine desktop handlers with injectable tools: AppKit/JXA, PowerShell,
  XDG desktop entries, X11 tools and yabai for macOS Space/window identities.
- Added 13 desktop tests (27 native tests total), including platform argument
  arrays, MIME/default handlers, partial bounds, unsupported paths and queueing.
- Documented prerequisites, explicit unsupported combinations and clipboard
  round-trip limitations. No new dependencies or generated API changes.
- Manually smoke-tested on Node 24.20.0/Linux: discovered 10 real applications;
  confirmed missing xdg-mime, no-display and unsupported-file-selection errors.
  The requested exec/shell search has no matches (rg exit 1).
Not done / risks:
- This host has no display or desktop tools, so live X11/Wayland, macOS and
  Windows effects were not smoke-tested; platform scripts need OS review.
- macOS windows require installed/running yabai and its permissions; Space
  indices must be refreshed after rearrangement. Numeric bounds on a native
  fullscreen window require leaving fullscreen first.
- Windows desktop enumeration/generic fullscreen, Linux file selection and
  Wayland window/frontmost inspection reject explicitly. Clipboard selection
  has the documented focus, clipboard-manager and delayed-provider caveats.
- The requested cross-platform implementation plus tests exceeds the roughly
  600-line task sizing guideline (~1,000 added lines); only native/docs changed.
```
