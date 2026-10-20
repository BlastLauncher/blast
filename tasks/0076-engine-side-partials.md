---
id: "0076"
title: Close engine-side coverage partials (rememberUserChoice, fallbackText, Cache directory, getContent, SubmitForm, PasteAction)
status: todo
milestone: M5
depends: ["0065"]
---

## Goal

The non-deprecated `partial` entries that belong to the engine and runtime
(not the client) reach `covered`, with tests carrying `@covers` evidence.

## Context

- List them with `rg -n "@covers .* partial" packages` after 0065 merges.
  Expected here:
  - `Alert.Options.rememberUserChoice`: persist the choice per
    command/alert in `blast:internal` storage and skip the alert next time;
  - `LaunchProps.fallbackText`: launch option through `extension.launch` and
    the CLI;
  - `Cache.Options.directory`;
  - `BrowserExtension.getContent`: format conversion and CSS selectors are
    the embedder's job; document how the result passes through;
  - `Action.SubmitForm` / `onSubmit`;
  - `PasteAction` / `CopyToClipboardAction` / `ActionPanelItem` (deprecated
    aliases, but listed partial).
    Read each test's comment to learn why it is partial.
- If a partial is partial because only an embedder can complete it, make the
  catalog entry or docs say so and leave the tag, with a one-line reason in
  Handoff.

## Acceptance

- [ ] Each entry above is `covered` or has a documented embedder-only reason.
- [ ] `bun run compat:report` leaves no diff; Handoff lists the counts
      before → after.
- [ ] `bun run verify` passes.

## Out of scope

- Client-core semantics (0065), deprecated symbols that are _missing_ (0071).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
