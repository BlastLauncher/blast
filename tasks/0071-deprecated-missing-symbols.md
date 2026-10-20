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
Branch/commit: t3/deprecated-missing-symbols @ c8a0567
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 119.9s
Done:
- Deprecated coverage 889/939 -> 939/939 (missing 50 -> 0); non-deprecated unchanged (1533/1534, 1 partial).
- clipboard: `CopyOptions.transient` and `CopyToClipboard.Props.transient` forward to `clipboard.copy` params; the catalog's copy params gain the optional `transient` field (paste does not).
- id props: `Action.Props.id` and `ActionPanel.Submenu.Props.id` pass through to the scene (aliases inherit via the coverage report).
- environment: `theme` mirrors `appearance`; `commandMode` mirrors the launched mode; `launchContext` comes from `init.command` and clears on a plain launch.
- legacy preferences: `preferences`, `Preference`, `Preferences`; each entry's `value` is the live `getPreferenceValues()` value, mutated in place.
- `Color.Brown` dynamic pair; `SubmitFormAction.displayName`; `useActionPanel`/`ActionPanelState` retain the last installed panel; `randomId`, `useId`, and legacy `render` (mounts during module import, wrapped in navigation for view commands).
- Stub wrappers drop cached children when a member is replaced or deleted (needed for live `preferences`).
- Tests: behavioural coverage for each item, plus a `fixtures/runtime/render.js` end-to-end legacy command in `main-test`.
Not done / risks:
- `Color.Brown` has no value in the declarations; used Apple's documented system brown (`#A2845E` / `#AC8E68`). Replace if Raycast's historical value is confirmed.
- `init` carries preference values only, so legacy `preferences.*` metadata (`type`, `title`, `required`, `description`) is synthesized (`textfield`, name, false, ""); wiring manifest preference schemas through the protocol would need a protocol change (0067 territory).
- `useActionPanel().update` retains state but is not injected into the focused view's scene actions: Blast views take an `actions` prop. Real Raycast injected the panel; a follow-up could let List/Grid/Detail/Form consume the legacy panel.
- `render` is supported while the command module is imported (its legacy usage); a later call throws.
```
