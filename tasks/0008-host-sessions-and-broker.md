---
id: "0008"
title: Host library — bundle, spawn, session, capability broker
status: review
milestone: M1
depends: ["0004", "0007", "0010"]
---

## Goal

`packages/host` (`@blastlauncher/host`) can bundle a Raycast extension command,
run it in a dedicated runtime process, expose a typed session (scenes, logs,
events, exit), and answer capability requests through a deny-by-default
broker — and survive the extension crashing.

## Context

- Read `docs/decisions/0001-process-and-scene-model.md` and
  `docs/architecture.md`. `host` must not import runtime code; it locates the
  runtime entry via `import.meta.resolve("@blastlauncher/runtime/main")` (add
  that export to the runtime package) and spawns it.
- Spawn with an explicit Node binary (`nodePath` option, default `"node"`),
  never `process.execPath` (the host may run under Bun).
- `init.command.mode` (added in task 0010) comes from the manifest command's
  `mode`; a `no-view` session ends after the command resolves.
- Bundling: `bundleCommand({ extensionDir, command, outDir })` reads the
  extension `package.json` manifest (`name`, `commands[].name`), resolves
  `src/<command>.{tsx,ts,jsx,js}`, and bundles with esbuild (ESM, platform
  node, automatic JSX, externals `@raycast/api`, `react`, `react/*`). Returns
  `{ entry }`. Default `outDir` under `os.tmpdir()/blast/builds`.
- Session: `startCommand({ entry, extensionName, commandName, preferences?,
  broker, nodePath?, handshakeTimeoutMs? })` → session with `scenes()` (async
  iterator or event callback — pick one, keep it simple), `latestScene`,
  `logs`, `sendEvent(node, handler, args)`, `shutdown({ timeoutMs })`
  (shutdown message → SIGTERM → SIGKILL), and an `exited` promise resolving
  `{ code, signal, error? }`. Invalid runtime output kills the child and
  rejects/report with a protocol error.
- Broker: `createBroker({ "clipboard.copy": handler, ... })`; requests for
  names without a handler get `ok: false, error.code "denied"`; handler throws
  → `ok: false, code "failed"`.
- Fixtures under `fixtures/extensions/` (TSX source + manifest `package.json`).

## Acceptance

- [x] Tests with a real bundled TSX fixture: first scene arrives; event
      changes the scene; granted `clipboard.copy` reaches the handler with
      `{ text }`; ungranted request → extension sees a rejection; extension
      that crashes (throws in an effect or calls `process.exit(3)`) → `exited`
      resolves with the code while the test process keeps running; shutdown
      escalation kills a child that ignores `shutdown`.
- [x] Bundle output is deterministic for the same input.
- [x] `bun run verify` passes.

## Out of scope

- CLI and script driving — task 0009. Real OS clipboard providers.

## Handoff

```
Branch/commit: t3/host-sessions-broker @ 73f6e3e24eee41e9286d72851197eb0bd4dc4975
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 6.1s
Done:
- Added manifest-driven deterministic TSX bundling and the runtime ./main export.
- Added typed scene callbacks, logs, events, handshake/exit reporting, and shutdown escalation.
- Added deny-by-default capability handling with denied/failed responses.
- Added 13 host tests using real Node 24 children; all 127 repository tests pass.
- Pinned esbuild 0.28.2 after npm view esbuild version; needed for TSX/ESM bundling.
Not done / risks: Review pending. Callers own bundle directories and must remove them after exit.
Default environment assets/support paths are beside the bundle; callers can override environment.
No Raycast API surface changed, so compat artifacts remain unchanged. CLI is task 0009.
```
