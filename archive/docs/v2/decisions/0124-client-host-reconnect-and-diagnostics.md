# ADR 0124: Reconnectable V2 client host and automated diagnostics

- Status: Accepted
- Date: 2026-09-02

## Context

`CoreClientHost.start()` was single-use: after the first controller reached
`failed` (structured `core.command.list-failed`) or `closed` (clean core
disconnect, e.g. daemon restart or socket close), a later `start()` rejected
with `host_already_started` while `runCommand`/`refreshCommands` rejected with
`controller_closed`. The renderer retry path calls `start()`, so the UI ended
in a dead end: a loading body with `Error invoking remote method
'blast:v2:run-command': CoreClientControllerError: The client controller is
closed` on every command, recoverable only by restarting the app. Daemon
`onError`/`onStderr` were also unwired in the Electron main process, so the
root cause was invisible.

## Decision

- `CoreClientHost.start()` reconnects when the existing controller is in a
  terminal `failed` or `closed` state: it detaches and best-effort closes the
  old controller, opens a fresh connection, and runs discovery again. Active
  states (`created`, `loading-commands`, `ready`, `starting`, `running`,
  `stopping`, `closing`) still reject with `host_already_started`, and a
  closed host still rejects with `host_closed`.
- The Electron main-process V2 bridge preserves structured error codes across
  the invoke boundary (`[code] message` plus a `code` property), logs daemon
  errors and extension stderr through `DEBUG=electron-client*`, and wires the
  daemon `onError`/`onStderr` callbacks.
- The renderer surfaces `[code] message` in the failure banner and snapshot
  errors, offers Copy diagnostics, and transparently reconnects once on
  `controller_closed` for Refresh (fall back to `start()`) and Run (reconnect
  then retry once).
- `pnpm run diagnose:v2` (in `@blastlauncher/e2e`) mirrors the Electron flow
  without Electron: socket checks, connect/handshake, discovery, and an
  optional `--run` command smoke with a millisecond timeline, error codes,
  actionable hints, and `--json` output.

## Boundary

This is a client-shell and tooling slice. It does not change the wire
protocol, session handshake, catalog trust, capability brokering, or extension
lifecycle. Reconnect always opens a fresh session; it never resumes an active
command or replays scene state.

## Consequences

Transient daemon restarts and structured discovery failures are recoverable
from the UI without an app restart. Automated error discovery runs headless
against any local core socket, shortening the debug loop for V2 startup and
command-launch failures.

## Verification

- `@blastlauncher/client` regression tests for reconnect after discovery
  failure, reconnect after clean close, and the active-host guard;
- Electron type-check plus renderer test suite;
- `pnpm run diagnose:v2 -- --socket <path> --run` against a live daemon;
- `pnpm run lint` and `pnpm run fmt:check`.
