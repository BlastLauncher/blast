---
id: "0111"
title: Honour paste closeMainWindow in native handlers and the AppKit launcher
status: doing
milestone: M7
depends: []
---

## Goal

`Clipboard.paste(content, {closeMainWindow})` behaves as in Raycast for every
embedder we ship. With `true` (the default), the launcher's window goes away
before ⌘V. With `false`, the window stays visible, but the keystroke still
reaches the app the user was in. Embedders using `@blastlauncher/native` get a
hook that lets them do the same.

## Context

- The runtime always sends `params.closeMainWindow` as a boolean
  (`packages/runtime/src/api/clipboard.ts`, `paste`). The protocol catalog
  already declares it (`packages/protocol/src/capabilities.ts`).
- AppKit launcher: `examples/macos-launcher/Sources/BlastLauncher/Clipboard.swift`
  (`ClipboardAdapter.paste`) always calls `NSApplication.shared.hide`, so it
  ignores the flag. `LauncherApp.swift` routes `clipboard.paste`.
  - Put the decision in a pure BlastKit type, e.g. a paste plan parsed from the
    params, with the default `true` when the flag is absent. Test it offscreen
    next to `ClipboardContent`.
  - The AppKit side stays a thin adapter. For `false`, a reasonable adapter
    hides the app, pastes, then calls `NSApp.unhideWithoutActivation()`, so the
    window is visible again but focus stays with the target app.
- `packages/native/src/index.ts`: `clipboard.paste` writes, then posts the
  keystroke. Native cannot see the embedder's window. Add an optional
  `createNativeHandlers({ beforePaste })` callback that receives
  `{ closeMainWindow: boolean }` and is awaited after the clipboard write and
  before the keystroke. If it throws, the paste fails and no keystroke is
  posted. Test this with the injected `run` fake: check the call order, and
  check that a rejecting hook means no keystroke.
- Docs:
  - `docs/capabilities.md`: the `closeMainWindow` contract for `clipboard.paste`
    handlers, and the native `beforePaste` hook.
  - `examples/macos-launcher/README.md`: one line on the behaviour.

## Safety (hard rules)

T3 Code, the app running the agents, has an open window on this Mac.

- Never run anything that hides, moves or focuses real windows, posts
  keystrokes, writes or reads the real clipboard, runs `osascript` or `open`,
  or kills or quits apps.
- Never launch the BlastLauncher executable.
- `swift test` and `bun test` with fakes are the only verification.

## Acceptance

- [ ] BlastKit tests cover the paste plan: absent flag gives close; `true`
      gives close; `false` gives keep-visible; a non-boolean value is an
      `invalid_argument` error or defaults to close, and the test documents
      which.
- [ ] The adapter uses the plan. `swift test --package-path examples/macos-launcher`
      passes, and the test count rises from 86.
- [ ] Native tests:
  - [ ] `beforePaste` receives `{closeMainWindow}` from the params;
  - [ ] the call order is write, hook, keystroke;
  - [ ] a hook rejection skips the keystroke and rejects the paste;
  - [ ] with no hook, behaviour is unchanged.
- [ ] Docs updated as above.
- [ ] `bun run verify` passes.

## Out of scope

- TUI and `blast run` paste behaviour. They copy into a session-local clipboard
  and stay as they are.
- macOS window operations (task 0112).
- Changing the runtime or protocol.

## Handoff

```
Branch/commit: t3/paste-close-main-window @ 75af613dd8f41bf21a5c22f0a9683ce8d7dc4a7f
Verify: `bun run verify` PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok); `swift test --package-path examples/macos-launcher` PASS (87 tests); `bun test packages/native/src/index.test.ts` PASS (16 tests)
Done:
- Added the pure `ClipboardPastePlan` with Raycast's default-close behavior and offscreen coverage for absent, true, false, and malformed flags.
- Updated the AppKit launcher to hide before paste and unhide without activation when `closeMainWindow` is false.
- Added the awaited native `beforePaste` hook and fake-runner tests for payload, ordering, rejection, and unchanged no-hook behavior.
- Documented the close-window contract and hook for embedders.
Not done / risks: The AppKit adapter's real window and keystroke behavior remains covered by pure/offscreen tests only, per the task safety rules.
```
