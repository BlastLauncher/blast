---
id: "0028"
title: Launch props, arguments, launchCommand, closeMainWindow, Image enums
status: doing
milestone: M3
depends: []
---

## Goal

Commands receive real launch props and can launch other commands and close
the window: `LaunchProps` (657 extensions), `closeMainWindow` (600),
`LaunchType` (454), `launchCommand` (398), plus `Image.Mask` and the rest of
the `Image` value surface (478).

## Context

- Declarations in `compat/raycast-api/index.d.ts`. Today the runtime passes
  `{ arguments: {}, launchType: "userInitiated" }` (decision 0001 / task 0010).
- Arguments: manifest `commands[].arguments` (name, type, required,
  placeholder). The host reads them in `bundleCommand`, the CLI accepts
  `--argument name=value` (repeatable) and errors on missing required ones;
  `init` carries `arguments` and `launchContext` — a protocol addition: add
  optional fields to `init.command` in `@blastlauncher/protocol` with tests and
  a one-line note in decision 0001.
- `LaunchType` enum values from the declarations; `launchType` in props and
  `environment.launchType`.
- `launchCommand({ name, type, extensionName?, arguments?, context? })` →
  capability `command.launch`; the CLI prints it when granted
  (`--grant command.launch`); it does not start a second session yet.
- `closeMainWindow({ clearRootSearch?, popToRootType? })` resolves after
  recording a `closeMainWindow` flag on the root `Navigation` node (like HUD
  in decision 0004); `PopToRootType` enum from the declarations.
- `Image.Mask` (and other value enums under `Image`) via the enum generator in
  `scripts/compat/generate-enums.ts` if possible.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Other workers build Grid (0029) and MenuBarExtra (0030)
  in parallel; avoid their files.

## Acceptance

- [ ] Protocol tests for the new optional init fields; CLI e2e for
      `--argument` incl. a missing required argument (exit 2).
- [ ] Runtime tests for launchCommand granted/denied, closeMainWindow scene
      flag, LaunchType/PopToRootType/Image.Mask values.
- [ ] `bun run verify` passes.

## Out of scope

- Actually starting the launched command; background (`LaunchType.Background`)
  scheduling.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
