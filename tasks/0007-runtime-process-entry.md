---
id: "0007"
title: Runtime child-process entry speaking the protocol over stdio
status: todo
milestone: M1
depends: ["0004", "0005", "0006"]
---

## Goal

`node packages/runtime/src/main.ts` is a complete extension runtime: it
performs the handshake, loads the command entry with `@raycast/api` and `react`
resolved to Blast's own modules, streams scene snapshots, handles events and
capability results, and shuts down cleanly or fails loudly.

## Context

- Read `docs/decisions/0001-process-and-scene-model.md`.
- Use `@blastlauncher/protocol` (task 0004) for parsing/encoding; replace the
  reconciler's local scene types with the protocol's types.
- Module resolution: `node:module` `registerHooks` (sync hooks, Node ≥ 23.5)
  mapping `@raycast/api` → the runtime's `src/api/index.ts`, and `react`,
  `react/jsx-runtime`, `react/jsx-dev-runtime` → the runtime's own `react`
  install so there is exactly one React instance.
- Lifecycle: read stdin with the line decoder → first message must be a valid
  `init` with `protocol === PROTOCOL_VERSION` (else `error` fatal, exit 1) →
  reply `ready` → dynamic-import `command.entry` (file path) → render its
  default export as a component → publish `scene` per commit → `event` →
  `dispatch` (errors become non-fatal `error` messages) → `shutdown` →
  unmount, exit 0. Stdin EOF also shuts down.
- `capability.request` ids are unique per process; `capability.result`
  resolves/rejects the matching promise; unknown ids are a protocol error.
- stdout is reserved for protocol messages: redirect `console.*` to `log`
  messages. Uncaught exceptions/rejections → `error { fatal: true }`, exit 1.
- Review follow-ups from task 0005 (do these here): add an `onError`
  option to `createSceneRoot` so errors from asynchronous re-renders (timers,
  promises calling `setState`) surface immediately instead of waiting for the
  next `flush()` — the runtime reports them as fatal `error`; and serialize
  `undefined` array elements as `null` (JSON semantics) instead of dropping
  them, so indices stay stable.
- Tests spawn real `node` processes with plain `.js` ESM fixtures under
  `fixtures/runtime/` that import from `@raycast/api` and `react/jsx-runtime`
  (no bundling needed). Put a small test helper that drives a child via
  stdio in the runtime package's test code.

## Acceptance

- [ ] Tests (real child processes): handshake + first scene; event → state
      change → new scene; copy action → `capability.request` → host replies →
      `onCopy` effect visible in next scene; `console.log` arrives as `log`;
      wrong protocol version → fatal error, exit 1; throw during render →
      fatal error, exit 1; `shutdown` → exit 0; no non-protocol bytes on
      stdout in any test.
- [ ] Extension code sees a single React instance (hooks work across the
      `@raycast/api` boundary).
- [ ] `bun run verify` passes.

## Out of scope

- Bundling TSX, spawning from a host library, the CLI — tasks 0008/0009.
- Preferences/environment APIs beyond passing them through `init`.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
