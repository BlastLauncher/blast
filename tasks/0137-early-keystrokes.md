---
id: "0137"
title: Keep keystrokes typed before an extension's first scene
status: todo
milestone: M8
depends: ["0135"]
---

## Goal

In the browser demo, text typed right after launching a command (while it
shows "Starting…") lands in the command's search bar once the first scene
appears, the way a native launcher feels. Nothing is lost or typed twice.

## Context

- `examples/browser-demo/client.ts`:
  - `launch()` closes the root list. Until the first scene arrives, the app has
    no `#search`, so keydown and input events typed in that window go nowhere.
    With a prebuilt bundle on a warm sandbox this window is short; on a cold
    start or with esbuild-wasm it is long.
  - The frame and `replaceApp()` keep inputs alive after the first scene (task
    0134).
- **Buffer.** While a command is starting (between `launch()` and the first scene
  for that session), capture these keys into a small buffer:
  - printable characters (`event.key.length === 1`, no Cmd/Ctrl/Alt);
  - Backspace.

  Ignore and do not replay Enter, the arrows and Cmd shortcuts. Escape during
  startup keeps its current meaning (back or stop).

- **Flush.** When the first scene arrives:
  - If it is a list or grid with a search bar, apply the buffer to the
    controller with `{ type: "search", text }`, draw it, and put the caret at the
    end of `#search`.
  - If the scene is a detail or form view, or it controls `searchText` itself,
    drop the buffer.
  - Clear the buffer when the session stops or another launch begins, so it
    never leaks into the next command.
- **Paste.** A paste during startup is captured the same way, with no clipboard
  API calls; read only the paste event's data.
- **IME.** Skip `event.isComposing` keys. Composition during startup is out of
  scope.
- **Visual.** While starting, show the buffered text in the frame's search
  field area (for example as the pending value of a disabled or readonly
  `#search`), so the user sees their typing.

## Acceptance

- [ ] `bun run site:e2e`:
  - Launch the `browser-keyboard` fixture.
  - Immediately (no wait) `page.keyboard.type("ab")`, then Backspace, then
    "c".
  - After the first scene, `#search` is focused with value "ac", and the list
    is filtered by "ac". Assert on the filtered rows.
  - Launching `browser-form` with early typing shows no stray text in any field.
  - To make the startup window reliable, the e2e can delay the first scene
    through a test-only hook that already exists, or a fixture that
    renders after a short `setTimeout`. No product-code test hooks.
- [ ] Unit test for the buffer logic as a pure helper: printable chars,
      Backspace, ignored keys, modifier keys, and composition.
- [ ] `bun run verify` passes. `site:e2e` passes 3 times in a row.

## Out of scope

- No changes to client-core or the runtime protocol.
- No buffering for the root list (it is always interactive).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
