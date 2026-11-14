---
id: "0168"
title: Close engine prompt and root view gaps the TUI migration found
status: todo
milestone: M9
depends: []
---

## Goal

The engine's launch-prompt and root views carry everything a client needs to
match Raycast and the old TUI picker, so no client patches around them.

## Context

- Found while moving the TUI onto `engine.root`/`startLaunchFlow` (0160;
  see its merge commit and `packages/tui/src/launcher.tsx`, `launcher.test.tsx`).
  Code: `packages/client-core/src/prompt.ts`, `root.ts`, `form-view.ts`;
  `packages/host/src/launch-flow.ts`, `root.ts`.
- Gaps, each additive to `ControllerView` / protocol v1:
  1. Required form fields are not marked; add `required: boolean` to form
     field views (the error text may stay "Required").
  2. Every field's description is always visible; add the focused field's
     `info` only (or a `focused` flag) so clients can show it on focus, like
     command forms.
  3. Prompt titles/sections: "Set up <title>" / "Configure <title>" are fine,
     but section headers should say "Extension" and "Command" (as Raycast
     does), not the extension title.
  4. Configure has no scope: `extension.configure` and the root's Configure
     Command take an optional `scope: "extension" | "command"` and show only
     that section; `preferences.open` with a scope uses it.
  5. The root clears its selection when a command ends; keep the last
     launched command selected, also when the launch throws.
  6. `startLaunchFlow` result exposes the `argumentValues` it launched with
     so clients can relaunch without wrapping the handle.
- Then remove the TUI's workarounds for 4–6 and restore the original
  `launcher.test.tsx` assertions that 0160 had to loosen where they now hold.
- Regenerate the schema; update `docs/launch-prompts.md`.

## Acceptance

- [ ] client-core/host tests for each gap; serve test for `scope`.
- [ ] TUI workarounds for 4–6 removed; `launcher.test.tsx` asserts the
      extension-only Configure form and the kept selection.
- [ ] `bun run protocol:schema`; `bun run verify` passes.

## Out of scope

- New field types, visual changes in clients other than using the new fields.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
