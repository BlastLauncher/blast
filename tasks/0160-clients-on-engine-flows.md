---
id: "0160"
title: TUI on the engine root view and launch prompts
status: todo
milestone: M9
depends: ["0157", "0158", "0159"]
---

## Goal

The terminal client (`packages/tui`) uses the engine root view and launch
prompts (`engine.root`, `startLaunchFlow`) instead of its own command picker,
ranking and preferences form, with the same look and keys.

## Context

- Decision 0014 consequences. Today `packages/tui/src/picker.tsx` (812 lines)
  ranks commands, builds the preferences form and installs dependencies
  itself. The engine now does all of that: `packages/host/src/root.ts`
  (`engine.root`), `packages/host/src/launch-flow.ts` (`startLaunchFlow`),
  `packages/client-core/src/root.ts` and `prompt.ts`. Draw their
  `ControllerView`s with the TUI's existing list/form renderers.
- Keep the TUI's UX: layout, palette, keys (including Configure Command,
  ⌘⇧, / Ctrl+Shift+,), live `package.json` reload, custom capability
  handlers passed to launched commands.
- Keep the existing `picker.test.tsx` scenarios as behaviour tests against
  the new wiring; adapt only how they reach state, not what they assert.

## Acceptance

- [ ] No command ranking or preference-form building left in
      `packages/tui/src` (grep in Handoff; list leftovers with reasons).
- [ ] Handoff gives `picker.tsx` (or its replacement) line counts before/after.
- [ ] TUI tests pass; `bun run verify` passes.

## Out of scope

- Engine changes (report gaps in Handoff), visual redesigns, other clients.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
