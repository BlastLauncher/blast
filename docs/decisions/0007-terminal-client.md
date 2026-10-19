# 0007 — Terminal client first (OpenTUI), native desktop later (MyGo)

Status: accepted 2026-10-19

## Decision

1. **M4 client is a terminal UI** in `packages/tui`, built with OpenTUI
   (`@opentui/core` + `@opentui/react`). It is the first interactive client and
   the place where client-owned behaviour lives: search-bar filtering and
   section ordering, selection, the action panel, navigation pop, toasts, HUD
   and alerts, menu-bar menus rendered as a list.
2. **The client runs on Bun.** OpenTUI requires Bun ≥ 1.3.14 or Node ≥ 26.4,
   and Blast's product baseline is Node 24. Bun is already the dev toolchain,
   so `packages/tui` is the one package allowed to require Bun. `protocol`,
   `runtime` and `host` stay Node 24-runnable, and the host still spawns each
   extension command in a `node` child process (decision 0001). The client
   must not leak Bun-only behaviour into host code paths (see task 0050:
   Bun's `isBuiltin` differs from Node's).
3. **In-process host API.** The TUI imports `@blastlauncher/host`
   (`bundleCommand`, `startCommand`, `session.scenes`, `sendEvent`, brokers)
   and never imports runtime code. It renders protocol scenes; it owns no
   extension state beyond presentation (selection, search text, overlays).
4. **Scenes map to components.** One renderer per public node type
   (`List`, `List.Item`, `Detail`, `Form.*`, `Grid.*`, `ActionPanel`, …),
   resolving element-valued props through `Slot` children (architecture.md).
   Unknown node types render as a visible placeholder, never crash the client.
5. **Capabilities are answered by the client** through a broker: storage and
   other session-scoped capabilities as in `blast run`; clipboard, open and
   other effects prompt or follow explicit config. The deny-by-default rule is
   unchanged.
6. **Testing is headless.** Components are tested with OpenTUI's test
   renderer (`@opentui/react/test-utils`, `@opentui/core/testing`) by driving
   fixture extensions and asserting rendered frames and key handling.
   `bun run verify` stays the only gate.
7. **Native desktop comes later with MyGo** (pure-Go desktop framework,
   native GPU UI or system webview). It is young (v0.x, Oct 2026), so it is a
   later milestone. A Go client cannot import the TypeScript host, so that
   milestone starts with its own decision record for an out-of-process
   client↔host protocol (likely NDJSON over stdio, like decision 0001).

## Why

A terminal client is the smallest real UI: no windowing toolchain, minimal
disk (OpenTUI core ≈ 18 MB plus a ≈ 5 MB native renderer), and it exercises
every client-owned behaviour the headless CLI cannot. OpenTUI's React binding
matches how extensions are written, and its test renderer keeps the client
testable in `bun test`.

## Consequences

- `packages/tui` is excluded from the Node-24 rule; everything else is not.
- The TUI's React (OpenTUI's reconciler) is separate from the extension's
  React, which lives in the runtime child process.
- Partials that wait on "a client" become TUI tasks.
- The MyGo milestone needs a host protocol before any Go code.
