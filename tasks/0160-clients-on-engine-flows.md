---
id: "0160"
title: TUI on the engine root view and launch prompts
status: doing
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

- [x] No command ranking or preference-form building left in
      `packages/tui/src` (grep in Handoff; list leftovers with reasons).
- [x] Handoff gives `picker.tsx` (or its replacement) line counts before/after.
- [x] TUI tests pass; `bun run verify` passes.

## Out of scope

- Engine changes (report gaps in Handoff), visual redesigns, other clients.

## Handoff

```
Branch/commit: t3/662d44d4 @ 4d85eb4 (code; this Handoff is the next commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok,
  mac-fixtures ok, workflow ok, test ok) in 160.4s — 1099 pass, 0 fail, seed 1001066997
Done:
- picker.tsx (812) → launcher.tsx (328): engine.openExtension + engine.root
  with RootOptions.launch; the TUI runs startLaunchFlow for prompts/installs,
  then the existing session-bound App for the command (crash/R relaunch, HUD).
- Removed picker.ts (33, filterCommands/modeLabel/commandRow) and
  preferences.tsx (336, LaunchGate/PreferencesView); manifest-parse tests
  moved to packages/host/src/extension-manifest.test.ts.
- app.tsx 635 → 718: rendering/keys extracted to ViewFrame, which draws any
  ControllerView (root, prompt, command); prompt forms are rebuilt from
  view.form.items because prompt views carry no scene.
- Keys: Enter, ↑/↓, typing, Esc/Ctrl-C quit, Ctrl-K actions, Ctrl-E sends the
  root's Configure shortcut (Ctrl+Shift+, / ⌘⇧,). Live package.json reload,
  `Manifest: …` error line, custom handlers and preferences.open kept.
- launcher.test.tsx: all 15 scenarios against the new wiring; docs/tui.md and
  docs/capabilities.md updated.
Grep (packages/tui/src): `filterCommands|rankGroups|score(|.preferences(|
  savePreferences|missingRequired|LaunchGate|PreferencesView|
  dependencies.(check|install)` → no matches. No leftovers.
Not done / risks:
- Assertions changed where the engine's views differ (engine gaps, not
  fixed): prompt titles are "Set up <title>" / "Configure <title>" (not
  "Launch …" / "Preferences — <ext>"), no `*` required marker, errors read
  "Required", field descriptions always show, dropdowns render as option
  lists, sections are titled by extension title (not "Extension").
- Engine gap: launch-flow `configure` has no scope, so preferences.open with
  scope "extension" shows both sections (test updated to assert that).
- Engine gap: root.reset() clears selection; the TUI re-selects the command
  after a command exits. A launch that throws loses the selection (the
  root's failure toast would otherwise be cleared by the re-select).
- Dependencies now install at launch (progress view, Retry), not in the
  background when the picker opens; the install test was adapted to that.
- Relaunch captures argument values through a launch-recording proxy of the
  extension handle (LaunchFlow does not expose them).
- A stored password is never sent to the client, so editing it in Configure
  replaces it (test types "secret2" instead of appending "2").
```
