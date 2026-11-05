---
id: "0112"
title: macOS window operations without yabai (System Events fallback)
status: doing
milestone: M7
depends: []
---

## Goal

`@blastlauncher/native` answers `window.desktops|list|active|setBounds` on
macOS when `yabai` is not installed. It falls back to Core Graphics for reads
and System Events (Accessibility) for moves, resizes and fullscreen. yabai stays
the preferred backend when it is present.

## Context

- Current backend: `packages/native/src/windows-macos.ts`, which uses yabai
  only. It is routed from `packages/native/src/windows.ts`.
  - Tools are injected through `DesktopTools` (`packages/native/src/desktop.ts`:
    `command`, `jxa`). Tests fake them in `packages/native/src/desktop.test.ts`.
  - Fixed scripts live in `desktop-scripts.ts` and `windows-scripts.ts`.
- Backend choice:
  - Use yabai when the `yabai` command exists. Detect a missing executable from
    the runner's error. Never install or start anything.
  - Otherwise use one fixed JXA script that takes JSON in argv. There is no
    string interpolation of params into scripts.
- Fallback semantics:
  - **Desktops:** one `User` desktop per screen. `screenId` is the display
    UUID, and the id is a stable per-screen string. `active` means the screen
    holding the frontmost window. Spaces are not distinguishable without yabai,
    and the docs say so.
  - **Windows:** read with `CGWindowListCopyWindowInfo` (on-screen, layer 0).
    The id is `kCGWindowNumber` as a string, and `desktopId` is the screen the
    window is on. `active` is the frontmost app's front window.
  - **Capability flags:** `positionable`, `resizable` and `fullScreenSettable`
    come from Accessibility where they can be read. Otherwise they are
    conservative, and the docs say which.
  - **setBounds:** match the CG window to a System Events window of the same
    pid by its current frame, then set position and size, or `AXFullScreen` for
    `"fullscreen"`.
  - **setBounds failures:**
    - A `desktopId` other than the window's current screen fails with a clear
      unsupported error.
    - Missing Accessibility permission fails with a message naming it.
    - An unmatched window fails as well.
- Keep the existing validation (`validateBounds`, id format checks) for both
  backends.
- Docs: update the native macOS bullet in `docs/capabilities.md`.

## Safety (hard rules)

T3 Code, the app running the agents, has an open window on this Mac. Moving,
resizing, hiding, fullscreening or closing it would break the session.

- Never execute the new JXA or yabai scripts, `osascript`, `yabai`, or any
  window operation against the real system, not even read-only listing.
- Never kill or quit apps.
- Tests use the injected `DesktopTools` fakes only. Assert the tool, the script
  identity and the JSON argv. Feed canned outputs.

## Acceptance

- [ ] Fake-tool tests for:
  - [ ] backend selection: yabai present, yabai missing, and yabai failing for
        another reason, which propagates rather than falling back;
  - [ ] fallback `desktops`, `list` and `active` output shapes from canned script
        output;
  - [ ] `setBounds` params passed to the script for numeric bounds and fullscreen;
  - [ ] rejection of a foreign `desktopId`;
  - [ ] the Accessibility-denied error;
  - [ ] invalid ids, which are rejected before any tool runs.
- [ ] The existing yabai tests still pass unchanged.
- [ ] `docs/capabilities.md` describes both backends and the fallback's limits.
- [ ] `bun run verify` passes.

## Out of scope

- Paste `closeMainWindow` (task 0111).
- Windows and Linux backends.
- Any change to the runtime or protocol.
- Live manual testing.

## Handoff

```
Branch/commit: t3/macos-windows-desktop-fakes @ e35f07f
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 54.8s
Done:
- Added fixed Core Graphics/System Events JXA fallback for macOS window reads and mutations when yabai is missing.
- Preserved yabai as the preferred backend and propagated non-missing yabai failures.
- Added fake-tool coverage for backend selection, fallback shapes and argv, validation, foreign desktops, and Accessibility errors.
- Documented yabai and fallback limits in docs/capabilities.md.
Not done / risks: The fallback depends on macOS Accessibility permission and intentionally cannot distinguish Mission Control Spaces or move windows across displays.
```
