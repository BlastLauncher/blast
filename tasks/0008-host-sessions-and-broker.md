---
id: "0008"
title: Host library — bundle, spawn, session, capability broker
status: todo
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

- [ ] Tests with a real bundled TSX fixture: first scene arrives; event
      changes the scene; granted `clipboard.copy` reaches the handler with
      `{ text }`; ungranted request → extension sees a rejection; extension
      that crashes (throws in an effect or calls `process.exit(3)`) → `exited`
      resolves with the code while the test process keeps running; shutdown
      escalation kills a child that ignores `shutdown`.
- [ ] Bundle output is deterministic for the same input.
- [ ] `bun run verify` passes.

## Out of scope

- CLI and script driving — task 0009. Real OS clipboard providers.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
