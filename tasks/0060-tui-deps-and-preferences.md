---
id: "0060"
title: TUI builds dependencies before launch; required preferences prompt
status: doing
milestone: M4
depends: ["0058", "0059"]
---

## Goal

`bun run tui <extensionDir>` works for a real extension end to end. The
picker installs the extension's dependencies when needed and shows progress.
It then asks once for required preferences that have no default (e.g. API
keys), stores them, and launches commands with those values.

## Context

- Dependency install API (task 0058, decision 0008):
  `checkExtensionDependencies` and `installExtensionDependencies` from
  `@blastlauncher/host` (`packages/host/src/install-dependencies.ts`).
  `bundleCommand` takes `dataDir` and uses a matching install.
- Gap to close: `packages/tui/src/session.ts` `openCommand` does not pass
  `dataDir` to `bundleCommand`, so the TUI never sees installs. Resolve one
  data dir for the TUI (`defaultDataDir()` unless the caller passes one) and
  use it for bundling, storage and preferences.
- Picker (task 0059): `packages/tui/src/picker.ts(x)`, `CommandSession`.
- Install behaviour:
  - When the picker opens, and again when `package.json` or
    `package-lock.json` changes (the picker already watches the directory),
    run the cheap check. If an install is needed, start it in the background.
  - Show a status line with the last npm log line, and an error line on
    failure.
  - A launch requested during an install waits for it, then launches.
  - A failed install does not block launching: bundling falls back to the
    shared allowlist, and any `MissingDependencyError` shows as a launch error.
  - Extensions whose dependencies are all runtime-supplied (only
    `@raycast/api`/`react`) need no npm run. Check: does the install skip npm
    in that case? If it doesn't, make it.
- Preferences:
  - Manifest `preferences` exist at extension level and on each command.
    Bundling already parses the defaults (`parsePreferenceDefaults` in
    `packages/host/src/bundle.ts`); extend that parsing rather than parsing
    again.
  - Add a small Node-runnable host store, `<dataDir>/preferences/<encoded
    name>.json`, written with mode 0600 and encoded like the storage file.
    Command-scoped values are keyed by command. `startCommand` already takes
    `preferences` and merges them over the defaults.
  - Before launch, if a required preference has no stored value and no
    default, show a preferences form in the picker. Types:
    - `textfield`, `file` and `directory`: text input.
    - `password`: masked.
    - `checkbox`: toggle, label from `label`.
    - `dropdown`: its `data`.
    - `appPicker`: text.
  - Saving stores the values and continues the launch. Esc cancels the
    launch.
  - Ctrl-E in the picker edits all preferences of the selected command,
    extension-level and command-level, required or not.
  - Wire the TUI's `preferences.open` capability (from
    `openExtensionPreferences`/`openCommandPreferences`): close the command,
    return to the picker and open that form.
- `blast run` could read the same store. Leave the CLI unchanged here, but
  export the store from the host so it can later.

## Acceptance

- [x] testRender tests, with an injected installer and a temp data dir, cover
      each of these:
  - On open, the picker runs the install and shows progress.
  - A launch during an install waits for it, then runs.
  - A failed install shows the error and still allows a launch.
  - A second open does not install again.
- [x] A test proves `openCommand` bundles from a matching install, e.g. the
      `installed-deps` fixture copied to a temp directory.
- [x] Preferences tests:
  - A required preference with no default blocks launch with the form.
  - Saved values persist across sessions and reach
    `getPreferenceValues()` (assert in a fixture command that renders it).
  - Ctrl-E edits them.
  - The store file has mode 0600.
- [x] Manual demonstration recorded in Handoff. Run `bun run tui` on one real
      corpus extension that declares a dependency outside the allowlist,
      fetched with `bun run corpus:fetch --extension <name>`. It must install
      and launch, and the Handoff states the installed size (`du -sh`). Remove
      that install and the checkout afterwards.
- [x] `docs/tui.md` (≤ 120 lines) and `docs/capabilities.md` describe install
      progress, the preferences form and where values are stored.
- [x] `bun run verify` passes.

## Out of scope

- Encrypting stored passwords (note the plain 0600 file in docs).
- CLI flags for preferences, pruning installs, corpus tooling changes.
- Installing during `bun test` from the registry.

## Handoff

```
Branch/commit: feat/0060-tui-deps-preferences @ 4c5e3cec9e82fc4b3f305467ef07d8630bea5cd4 (implementation)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 101.3s
Done:
- Picker checks/installs on open and manifest/lock changes, reports npm progress/errors, waits before launch, and permits fallback after failure. Runtime-only dependencies skip npm.
- One data root reaches bundling, storage and saved preferences; an offline fixture proves matching installs resolve in openCommand.
- Shared manifest parsing drives masked/typed preference forms, required-value gating, Ctrl-E editing and preferences.open. Host exports an atomic 0600 store with extension/command scopes.
- Offline tests cover install progress, waiting, failures, reuse, lock changes, runtime preference values, persistence, editing, capability return and file permissions. Updated TUI/capability docs; no new dependencies.
- Manual demo: bun run corpus:fetch --extension lorem-ipsum; then TERM=xterm-256color XDG_DATA_HOME="$PWD/.cache/demo-data" bun run tui .cache/raycast-extensions/extensions/lorem-ipsum in a PTY. The picker installed lorem-ipsum (^2.0.8, outside PROVIDED_PACKAGES), showed progress, and launched paragraphs with argument 1, returning to the picker via closeMainWindow without a crash. du -sh .cache/demo-data/blast/deps/lorem-ipsum reported 840K. Removed .cache/demo-data and .cache/raycast-extensions afterwards.
Not done / risks: Passwords are plaintext in mode 0600 files as scoped. CLI unchanged; automatic install/forms belong to picker mode. No push; independent review remains with the orchestrator.
```
