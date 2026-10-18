---
id: "0004"
title: Protocol package with message validation and NDJSON framing
status: doing
milestone: M1
depends: []
---

## Goal

`packages/protocol` (`@blastlauncher/protocol`) defines every host↔runtime
message, validates untrusted input into typed messages, and frames messages as
newline-delimited JSON, with zero dependencies.

## Context

- Read `docs/decisions/0001-process-and-scene-model.md` and
  `docs/architecture.md`.
- `PROTOCOL_VERSION = 1`. `JsonValue` = JSON-safe values only.
- Host → runtime messages (`type` field):
  - `init`: `{ protocol: number, command: { extension: string, name: string,
    entry: string }, preferences: Record<string, JsonValue>, environment: {
    extensionName: string, commandName: string, assetsPath: string,
    supportPath: string, isDevelopment: boolean } }`
  - `event`: `{ node: string, handler: string, args: JsonValue[] }`
  - `capability.result`: `{ id: string, ok: true, value: JsonValue }` or
    `{ id: string, ok: false, error: { code: string, message: string } }`
  - `shutdown`: `{}`
- Runtime → host messages:
  - `ready`: `{ protocol: number }`
  - `scene`: `{ revision: number, root: SceneNode | null }` — revision is a
    non-negative integer
  - `capability.request`: `{ id: string, name: string, params: JsonValue }`
  - `log`: `{ level: "debug" | "info" | "warn" | "error", message: string }`
  - `error`: `{ code: string, message: string, fatal: boolean }`
- `SceneNode = { id: string, type: string, props: Record<string, JsonValue |
  HandlerRef>, children: SceneNode[] }`, `HandlerRef = { $handler: string }`.
- API (in `src/`, re-exported from `src/index.ts`):
  - TypeScript types for all of the above (`HostMessage`, `RuntimeMessage`).
  - `parseHostMessage(value: unknown)` and `parseRuntimeMessage(value:
    unknown)` returning `{ ok: true, message } | { ok: false, error: string }`;
    the error names the failing field path (e.g. `command.entry: expected
    string`). Unknown `type` and unknown extra top-level fields are errors.
  - `encodeMessage(message): string` → one JSON line ending in `\n`.
  - `createLineDecoder({ maxLineBytes, onLine, onError })` returning
    `{ push(chunk: string | Uint8Array): void, end(): void }`. Handles lines
    split across chunks and multi-byte UTF-8 split across chunks; emits parsed
    JSON (not validated) per line; ignores blank lines; reports invalid JSON
    and oversize lines via `onError` and then stops emitting. Default
    `maxLineBytes` 8 MiB.

## Acceptance

- [ ] Tests cover every message type: one valid example and at least one
      invalid example each, with the error path asserted.
- [ ] Decoder tests: chunk boundaries inside a line, inside a multi-byte
      character, multiple lines per chunk, blank lines, oversize line, invalid
      JSON, `end()` with a trailing partial line (error).
- [ ] Round trip: `encodeMessage` → decoder → `parse*Message` yields the same
      message for every example.
- [ ] No runtime dependencies; no Node-only APIs (`TextDecoder` is fine).
- [ ] `bun run verify` passes.

## Out of scope

- Spawning processes, React, or any runtime/host logic.
- Changing the message set; if it looks wrong, say so in Handoff.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
