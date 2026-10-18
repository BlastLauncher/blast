---
id: "0010"
title: Runtime hardening — command mode, stdout guard, environment, preferences
status: review
milestone: M1
depends: []
---

## Goal

The runtime handles Raycast `no-view` commands, cannot have its protocol
stream corrupted by extension writes to stdout, and exposes `environment` and
`getPreferenceValues()` from the `init` message.

## Context

- Review follow-ups from task 0007. Read `docs/decisions/0001-*.md`,
  `packages/protocol/src/messages.ts`, `packages/runtime/src/main.ts`.
- **Command mode (protocol change):** add required
  `command.mode: "view" | "no-view" | "menu-bar"` to `init` in
  `@blastlauncher/protocol` (validation + tests). Update decision 0001 with
  one line noting the field. In the runtime: `view` renders the default
  export as today; `no-view` awaits `default(props)` as an async function,
  sends no scene, then exits 0 (rejection → fatal error, exit 1);
  `menu-bar` → fatal `error` with code `UNSUPPORTED` for now.
  Launch props for both modes: `{ arguments: {}, launchType: "userInitiated" }`.
- **Stdout guard:** keep a private reference to the real stdout writer for
  protocol output; replace `process.stdout.write` so extension writes become
  `log` messages (level `info`). Test with a fixture that calls
  `process.stdout.write("raw")`.
- **environment:** the `environment` export from `@raycast/api` is populated
  from `init.environment`, plus `raycastVersion: "0.0.0-blast"`. Check member
  names against `compat/raycast-api/index.d.ts`; members Blast does not set
  are `undefined` and stay `missing` in coverage.
- **getPreferenceValues():** returns `init.preferences` (a fresh shallow copy).
- Tag every implemented symbol/member with `// @covers` and regenerate
  `compat/` with `bun run compat:report`.

## Acceptance

- [x] Protocol tests cover `command.mode` valid/invalid values.
- [x] Runtime process tests (real `node`): no-view command runs and exits 0
      with no scene; no-view rejection → fatal, exit 1; menu-bar → fatal
      `UNSUPPORTED`; raw `process.stdout.write` arrives as a `log` and stdout
      stays protocol-only; `environment.commandName` and
      `getPreferenceValues()` reflect `init`.
- [x] Existing tests updated for the new required field.
- [x] `bun run verify` passes.

## Out of scope

- Host/CLI code (task 0008 adopts `mode` afterwards).
- Arguments, LaunchType enums beyond the string above, preference defaults.

## Handoff

```
Branch/commit: t3/runtime-protocol-hardening @ e2fd82b
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 4.0s
Done:
- protocol: `init.command.mode` is required and validated as
  `view | no-view | menu-bar`; valid/invalid values and a missing field have
  tests, decision 0001 records the field.
- runtime modes: `view` renders as before; `no-view` awaits `default(props)`,
  sends no scene and exits 0 (rejection -> fatal, exit 1); `menu-bar` -> fatal
  `UNSUPPORTED` before the extension is imported. Both modes receive
  `{ arguments: {}, launchType: "userInitiated" }`.
- stdout guard: the protocol keeps the original writer; `process.stdout.write`
  becomes an `info` log, so extension output cannot corrupt NDJSON.
- `environment` (init values + `raycastVersion: "0.0.0-blast"`) and
  `getPreferenceValues()` (fresh shallow copy of `init.preferences`) are
  exported from the shim and installed from `init` before import.
- compat regenerated: 40 -> 46 covered (`environment` partial + 6 members,
  `getPreferenceValues` partial). New process tests spawn real `node`.
Not done / risks:
- `environment` keeps Raycast's `commandName` (deprecated) because that is what
  `init.environment` carries; `entryPointName`/`entryPointMode` and the other
  members stay unset (`undefined`, still `missing`) until the protocol sends
  them.
- `getPreferenceValues` is tagged partial: Raycast merges declared preference
  defaults, which stays out of scope here.
- Host/CLI still build `init` without `mode`; task 0008 adopts the required
  field.
```
