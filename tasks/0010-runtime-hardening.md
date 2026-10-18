---
id: "0010"
title: Runtime hardening — command mode, stdout guard, environment, preferences
status: doing
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

- [ ] Protocol tests cover `command.mode` valid/invalid values.
- [ ] Runtime process tests (real `node`): no-view command runs and exits 0
      with no scene; no-view rejection → fatal, exit 1; menu-bar → fatal
      `UNSUPPORTED`; raw `process.stdout.write` arrives as a `log` and stdout
      stays protocol-only; `environment.commandName` and
      `getPreferenceValues()` reflect `init`.
- [ ] Existing tests updated for the new required field.
- [ ] `bun run verify` passes.

## Out of scope

- Host/CLI code (task 0008 adopts `mode` afterwards).
- Arguments, LaunchType enums beyond the string above, preference defaults.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
