# 0001 — Process, protocol, and scene model

Status: accepted 2026-10-18; absorbs 0003–0005

## Decision

1. Each running command gets one `node <runtime entry>` child. The host and
   commands never share a process; a crash, hang, or leak ends that command.
2. Host and runtime use newline-delimited JSON over stdio. Every line is one
   object with a `type`; lines are capped, and invalid or oversized input is a
   protocol error. The first exchange is `init`/`ready` with protocol version,
   command mode (`view | no-view | menu-bar`), and optional launch values.
3. A runtime publishes whole serialized React scenes after commits. Functions
   become handler references; clients send `event { node, handler, args }`.
   The `Navigation` root contains keyed entries and command-local feedback
   (`Toast`, `HUD`, `Alert`); covered entries stay mounted but undispatchable,
   and push/pop preserve the documented lifecycle and stable ids. Menu-bar
   trees use the same active entry and scene protocol. Clients own presentation.
4. The runtime resolves `@raycast/api` and `react` to Blast implementations.
   Extensions are bundled with esbuild while those modules stay external.
5. Privileged APIs use capability requests. The broker denies by default and
   answers `capability.result`; runtime children receive no host credentials.
   LocalStorage, Cache, OAuth tokens and open URL/path handling are scoped and
   validated by the host session. This is a trust boundary, not an OS sandbox.
6. `protocol` owns messages, validation and framing; `runtime` owns the
   reconciler and API shim; `host` owns bundling, spawning, sessions and broker.

## Why

Extensions are Node programs, so a Node child and simple stdio contract give
portable isolation. Whole scenes and a runtime-owned navigation/feedback model
keep clients deterministic without serializing React objects.

## Consequences

Large scenes cost more per update; measure before introducing patches. Every
privileged API needs a catalog entry and broker test. Clients must traverse the
active navigation entry and render unknown nodes safely.
