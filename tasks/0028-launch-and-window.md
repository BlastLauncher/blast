---
id: "0028"
title: Launch props, arguments, launchCommand, closeMainWindow, Image enums
status: review
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

- [x] Protocol tests for the new optional init fields; CLI e2e for
      `--argument` incl. a missing required argument (exit 2).
- [x] Runtime tests for launchCommand granted/denied, closeMainWindow scene
      flag, LaunchType/PopToRootType/Image.Mask values.
- [x] `bun run verify` passes.

## Out of scope

- Actually starting the launched command; background (`LaunchType.Background`)
  scheduling.

## Handoff

```
Branch/commit: t3/launch-window-protocol @ 827ff25 (tip adds this Handoff note)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 25.4s
Done:
- `init.command` gained optional `arguments` (manifest values, strings) and
  `launchContext` (JSON), validated field by field with rejection tests; the
  runtime turns them into `LaunchProps` and sets `environment.launchType`.
- The host reads `commands[].arguments` in `bundleCommand` (name, type,
  required, placeholder; unknown fields like a dropdown's `data` are ignored)
  and passes the values through `startCommand`. `blast run --argument
  name=value` supplies them; a missing required or unknown name exits 2.
- `launchCommand` requests `command.launch` (name, type, extensionName,
  ownerOrAuthorName, arguments, context, fallbackText; absent fields stay
  absent). `closeMainWindow` records `props.closeMainWindow` on the root
  `Navigation` node and mounts a no-view command's scene through the existing
  lazily-created scene hook.
- `Image.Mask`, the deprecated `ImageMask` alias, `LaunchType` and
  `PopToRootType` are generated from the declarations; the enum generator now
  reads namespace-scoped enums and a curated path list, and the shim exports
  `Image` (the one type-kind symbol with runtime members).
- Reports regenerated: non-deprecated coverage 826/1534 (was 809); smoke 61
  rendered / 1 completed, with one-thing/remove-one-thing now rendering
  instead of failing on the closeMainWindow stub.
Not done / risks:
- Out of scope as written: nothing starts a second session, background
  launches, `draftValues`/`fallbackText` props and dropdown `data` validation.
- `one-thing/set-one-thing --argument oneThing=x` hangs instead of failing:
  the extension returns a promise from a component and awaits `showToast`,
  which waits for a commit React never makes while it awaits that promise.
  Verified pre-existing on the base commit (a probe component that only awaits
  `showToast` deadlocks there too); Raycast also rejects async components. It
  is now reachable because the argument path no longer fails early on the
  `closeMainWindow` stub.
- `compat/COVERAGE.md`, `compat/raycast-api.json`, `compat/SMOKE.md` and
  `compat/smoke.json` were regenerated here and may conflict with 0029/0030;
  `bun run compat:report` plus `bun run corpus:smoke` regenerate them.
```
