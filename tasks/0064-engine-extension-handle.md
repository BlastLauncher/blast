---
id: "0064"
title: Engine API — extension handle (manifest, live reload, deps, preferences, launch)
status: doing
milestone: M5
depends: []
---

## Goal

An embedder can open an extension directory with one host call and get
everything a launcher needs: validated manifest and commands, live reload,
dependency status and install, the preference schema with missing-required
detection and storage, and a launch that returns a running session. The TUI
picker uses this API instead of its own logic.

## Context

- Decision `docs/decisions/0009` (points 1–3). Read it first.
- Today this logic is spread across the TUI:
  - `packages/tui/src/picker.ts`: `parseManifest`, `missingRequired`,
    manifest/argument types;
  - `picker.tsx`: `fs.watch` with debounce, install serialization,
    preference field merging and missing-required checks;
  - `session.ts`: `openCommand` = bundle + preferences + broker + start +
    cleanup.
- Host already has the pieces:
  - `bundleCommand` and `parsePreferences` (`bundle.ts`);
  - `createPreferenceStore` (`preferences.ts`);
  - `checkExtensionDependencies` / `installExtensionDependencies`;
  - `startCommand`, `createSessionBroker` and `defaultDataDir`.
- Add `packages/host/src/extension.ts`, exported from `index.ts`:
  `openExtension({ extensionDir, dataDir?, installer? })` returning a handle
  with:
  - `manifest()`: the current parsed manifest (`name`, `title`, `commands`
    with mode, arguments and preference schema), throwing a clear error on an
    invalid manifest;
  - `watch(listener)`: debounced reload on `package.json` /
    `package-lock.json`, delivering the manifest or the error, returning an
    unsubscribe function, closed by `close()`;
  - `dependencies`: `check()` and `install({ onLog })`, serialized so two
    installs never overlap;
  - `preferences(command)`: `{ extension: Preference[], command: Preference[],
    values, missing: Preference[] }`, plus `savePreferences(command, values)`,
    which splits values into extension/command scope like the picker does today;
  - `launch(command, { argumentValues?, handlers?, launchContext? })`: waits
    for a pending install, refuses with a typed error listing missing required
    preferences or arguments, then does what `openCommand` does and returns
    `{ session, close() }`;
  - `close()`.
- Then make the TUI thin:
  - `picker.tsx` and `session.ts` call the handle;
  - `picker.ts` keeps only launcher presentation (`filterCommands`,
    `modeLabel`, `commandRow`);
  - TUI behaviour and tests stay the same.
- Document the handle in `docs/architecture.md` under "Host sessions"
  (≤ 12 lines).
- Do NOT touch `packages/tui/src/{nodes,view,grid,dropdown,form-view}.ts`.
  Task 0063 moves them in parallel.

## Acceptance

- [ ] `packages/host/src/extension.test.ts` covers:
  - manifest parse and invalid-manifest error;
  - watch reload after rewriting `package.json` (and unsubscribe);
  - serialized install with an injected installer;
  - `preferences().missing`, and `savePreferences` scope split;
  - `launch` refusing on missing required preferences/arguments;
  - `launch` rendering a fixture scene, then `close()` removing the bundle
    directory.
- [ ] `rg -n "fs.watch|watch\\(|checkExtensionDependencies|parsePreferences|bundleCommand" packages/tui/src --glob '!*.test.*'`
      shows no direct use. The TUI goes through `openExtension`.
- [ ] All existing `packages/tui` tests pass.
- [ ] `bun run verify` passes.

## Out of scope

- `blast serve` (0066), renaming host to engine or publishing (0069),
  client-core (0063), new preference types or encryption.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
