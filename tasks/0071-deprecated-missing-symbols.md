---
id: "0071"
title: Implement the 50 missing deprecated @raycast/api symbols
status: doing
milestone: M5
depends: []
---

## Goal

Old extensions that use deprecated `@raycast/api` symbols run unmodified:
every deprecated path in the inventory is `covered` (or documented as
impossible), with `@covers` evidence.

## Context

- List: `bun -e` over `compat/raycast-api.json` entries with
  `status === "missing"`. Today these are:
  - transient copy: `Clipboard.CopyOptions.transient`,
    `*CopyToClipboard*.Props.transient`;
  - `id` props: `Action.Props.id`, `ActionPanel.Item.Props.id`,
    `ActionPanel.Submenu.Props.id` and their alias paths;
  - `ActionPanelState` / `useActionPanel`;
  - `Color.Brown` (with `light`, `dark`, `adjustContrast`);
  - `Environment.commandMode|commandName|launchContext|theme`,
    `environment.commandMode|launchContext|theme`;
  - `Keyboard.Shortcut.windows` / `KeyboardShortcut.windows`;
  - `Preference` (interface fields) and `Preferences`, `preferences`;
  - `SubmitFormAction.displayName`;
  - `randomId`, `useId`;
  - `render`.
- Read the vendored declarations in `compat/raycast-api/` for each symbol's
  exact shape and deprecation note. Implement in `packages/runtime/src/api/`
  next to the current implementation of each area, following existing alias
  patterns (see `aliases.test.ts`).
- Semantics hints:
  - `transient` passes through to the `clipboard.copy` params, and the
    capability catalog entry (`packages/protocol/src/capabilities.ts`) gains
    the optional field;
  - `id` props pass through to the scene;
  - `environment.theme` mirrors `appearance`;
  - `environment.commandMode` / `launchContext` come from init;
  - `preferences` is the same object as `getPreferenceValues()` values, typed
    by `Preferences`;
  - `render(element)` mounts the element as the command root (legacy API);
  - `randomId` / `useId` return unique ids;
  - `Color.Brown` uses Raycast's brown values from the declarations or docs;
    when unknown, pick a documented sensible pair and say so in Handoff;
  - `useActionPanel` / `ActionPanelState.update` keep a mutable action panel
    state for legacy code.
    Interfaces such as `Preference` are type-only. Cover them with a type-level
    test (a typed object literal in a test with `@covers`), as the existing
    type coverage does.
- If the catalog changes, the runtime/catalog drift test must keep passing.
  Task 0067 regenerates the schema in parallel; do not touch
  `packages/protocol/schema/`.

## Acceptance

- [ ] `compat/COVERAGE.md`: deprecated missing 50 → 0 (or each remaining one
      has a reason in Handoff). `bun run compat:report` is clean after commit.
- [ ] A test exercises each runtime behaviour above, not only its existence.
- [ ] `bun run verify` passes.

## Out of scope

- Non-deprecated changes, client-core, serve/schema (0067).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
