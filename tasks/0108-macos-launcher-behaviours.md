---
id: "0108"
title: macOS example, part 3 — hotkey, OS actions and extension picker
status: doing
milestone: M7
depends: ["0107"]
---

## Goal

The example behaves like a launcher: a global hotkey toggles the panel, it
lists commands from a folder of extensions, and OS capabilities (clipboard,
open URL/file, HUD) are answered by real AppKit handlers.

## Context

Real handlers sit behind the `BlastKit` capability handler protocol: tests use
fakes; only the app wires `NSPasteboard`, `NSWorkspace` and
`RegisterEventHotKey`. Tests must never write the real clipboard, open URLs,
launch apps or register a real global hotkey. Dependency installs follow
decision 0012 (`missing_dependencies` → offer install).

## Acceptance

- [x] Hotkey (configurable, default ⌥Space) toggles the panel; the toggling
      logic is tested through an injected hotkey source.
- [x] Root list of commands across a directory of extensions, searchable;
      tested with fixture directories.
- [x] Capability handlers for `clipboard.copy`, `clipboard.paste`, `open.url`,
      `open.path`: tested with fakes; the real implementations are thin and
      listed in the README. The HUD is not a capability: `feedback.hud` renders
      as a transient overlay.
- [x] `missing_dependencies` shows an install prompt and retries with
      `installDependencies`; tested with an injected engine response.
- [ ] `bun run verify` passes; CI `macos-example` green.

## Out of scope

- Code signing, notarisation, distribution; preferences UI beyond required
  values.

## Handoff

```
Branch/commit: t3/ad22912e @ bc45b08
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 71.1s
Swift test: Test run with 49 tests in 7 suites passed after 5.253 seconds.
Done:
- Replaced the NSEvent global monitor with a Carbon `RegisterEventHotKey` adapter; the key-code/modifier table is a pure, unit-tested function with a typed unsupported-key error.
- Removed the invented `hud.show` capability; the HUD now comes from `feedback.hud`, is carried as `LauncherDisplay.hud`, tested in the presenter and rendered as a transient AppKit overlay.
- `clipboard.paste` now writes text/html/file, hides the launcher, posts ⌘V and returns null, failing with `accessibility_required` when `AXIsProcessTrusted()` is false; `clipboard.copy` shares the same pure content-to-pasteboard-items mapping.
- `open.url`/`open.path` parse an optional `application` (string or object) purely and use `NSWorkspace.open(_:withApplicationAt:configuration:)` when it resolves, otherwise the default app.
- README documents the Carbon hotkey, the HUD source and the Accessibility requirement; capability/argument and hotkey-mapping tests added.
Not done / risks: CI `macos-example` cannot be confirmed from the worker (not pushed). The Carbon hotkey and ⌘V paste adapters stay untested by design so no test registers a global hotkey, posts a keystroke or touches the clipboard. Display-name application lookup checks `/Applications`, `/System/Applications` and `~/Applications`; a name outside those folders falls back to the default application.
```
