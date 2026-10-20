---
id: "0066"
title: "blast serve: engine over versioned NDJSON stdio for any-language embedders"
status: doing
milestone: M5
depends: []
---

## Goal

A Go, Swift, Rust or Tauri app can spawn `blast serve` and drive the whole
engine over stdin/stdout:

- open extensions, see manifests and live reloads;
- install dependencies, handle preferences;
- launch commands, receive scenes, send events;
- answer capability requests.

## Context

- Decisions `docs/decisions/0009` (points 2, 3, 5) and `0010` (points 2–3).
  Read them, plus `docs/architecture.md` "Host sessions" (engine, extension
  handle, registry).
- In-process API to wrap (`packages/host`):
  - `createEngine` / `register`;
  - `openExtension` handle: `manifest`, `watch`, `dependencies`,
    `preferences`, `savePreferences`, `launch`;
  - sessions: `scenes`, `sendEvent`, `exited`, `shutdown`;
  - `MissingLaunchValuesError`;
  - the capability catalog `CAPABILITIES` in `packages/protocol`.
- Write `docs/decisions/0011-embedder-protocol.md` (≤ 60 lines) first, then
  implement it. The shape to record:
  - **Framing:** NDJSON, one JSON object per line, same size cap as 0001.
  - **Handshake:** the embedder sends
    `{ type: "hello", protocol: 1, capabilities: [names it answers] }`; the
    server replies
    `{ type: "welcome", protocol: 1, engine: { version }, catalog: CAPABILITIES }`.
    A version mismatch fails with an error and exit code 2.
  - **Requests:** embedder → server `{ type: "request", id, method, params }`,
    answered by `{ type: "response", id, ok, result | error: { code, message, data? } }`.
    Methods:
    - `extension.open {dir}` → `{ extension }` (an opaque id);
    - `extension.manifest`, `extension.watch` / `extension.unwatch`;
    - `extension.dependencies.check|install` (install streams
      `event: dependencies.log`);
    - `extension.preferences {command}`, `extension.savePreferences`;
    - `extension.launch {command, argumentValues?, launchContext?}` →
      `{ session }`, or error code `missing_values` with the preferences and
      arguments in `data`;
    - `session.event {session, node, handler, args}`;
    - `session.close`, `extension.close`, `engine.shutdown`.
  - **Server events:** `{ type: "event", event, ... }` for
    `manifest.changed`, `manifest.error`, `dependencies.log`,
    `session.scene {session, scene}` (whole scene as in 0001),
    `session.log` and `session.exited {session, code, error?}`.
  - **Capability forwarding:**
    - the server sends
      `{ type: "capability.request", id, session, name, params }` for names
      the embedder declared in `hello`, and the embedder answers
      `{ type: "capability.result", id, ok, value | error }`;
    - abort sends `capability.cancel`; progress passes through;
    - undeclared names follow the engine registry: session-scoped are answered
      internally, the rest are denied;
    - `blast serve --native` registers `@blastlauncher/native` underneath,
      and embedder-declared names override it.
  - **Errors:** a malformed line answers an error and keeps going. Stdin EOF
    shuts down every session and exits 0.
- Message types and validators live in `packages/protocol/src/embedder.ts`,
  dependency-free, exported, and following the style of the existing
  messages/validation. The implementation is a new package `packages/serve`
  (`@blastlauncher/serve`, depending on host, protocol and native). Its
  entry, `packages/serve/src/main.ts`, runs on Node 24 with type stripping.
  The root script `"blast:serve": "node packages/serve/src/main.ts"`. Add
  `serve` to the CLI help only if trivial; it can stay a separate entry.
- Test (`packages/serve/src/*.test.ts`) by spawning the server as a child
  process and speaking NDJSON to it:
  - handshake and version mismatch;
  - open, launch, scene, event, then a new scene, using the
    `fixtures/extensions/hello-list` or `engine-handle` fixtures;
  - capability forwarding round-trip and denial of an undeclared name;
  - `missing_values`;
  - manifest watch event;
  - malformed line;
  - EOF shutdown.
- Update `docs/architecture.md` (diagram line + Packages row) briefly; full
  embedder docs are task 0067.

## Acceptance

- [ ] `docs/decisions/0011-embedder-protocol.md` exists and matches the code.
- [ ] Child-process tests above pass deterministically. No network; temp
      dirs only.
- [ ] `node packages/serve/src/main.ts` runs on Node 24 directly. Show a
      transcript in Handoff: hello → open → launch → first scene, via a
      heredoc piped into `node`.
- [ ] `packages/protocol` stays dependency-free.
- [ ] `bun run verify` passes.

## Out of scope

- client-core view models over the wire (later task), JSON Schema export and
  embedding docs (0067), the Go example (0068), publishing (0069).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
