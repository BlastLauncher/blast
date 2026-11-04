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

- [ ] Hotkey (configurable, default ⌥Space) toggles the panel; the toggling
      logic is tested through an injected hotkey source.
- [ ] Root list of commands across a directory of extensions, searchable;
      tested with fixture directories.
- [ ] Capability handlers for `clipboard.copy`, `clipboard.paste`, `open.url`,
      `open.path`, `hud.show`: tested with fakes; the real implementations are
      thin and listed in the README.
- [ ] `missing_dependencies` shows an install prompt and retries with
      `installDependencies`; tested with an injected engine response.
- [ ] `bun run verify` passes; CI `macos-example` green.

## Out of scope

- Code signing, notarisation, distribution; preferences UI beyond required
  values.

## Handoff

```
Branch/commit: t3-122aae73 @ pending commit
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 57.6s
Done:
- Added injected hotkey toggle state with configurable default ⌥Space.
- Added deterministic multi-extension manifest discovery and searchable picker entries.
- Added capability routing, real AppKit clipboard/open/HUD adapters, and typed dependency install confirmation/retry.
- Added fake-driven behavior and routing tests; updated launcher capability documentation.
Not done / risks: AppKit hotkey adapter uses NSEvent's global monitor; no automated test registers a real shortcut or touches OS state.
```
