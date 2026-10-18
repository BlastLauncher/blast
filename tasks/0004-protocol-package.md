---
id: "0004"
title: Protocol package with message validation and NDJSON framing
status: review
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

- [x] Tests cover every message type: one valid example and at least one
      invalid example each, with the error path asserted.
- [x] Decoder tests: chunk boundaries inside a line, inside a multi-byte
      character, multiple lines per chunk, blank lines, oversize line, invalid
      JSON, `end()` with a trailing partial line (error).
- [x] Round trip: `encodeMessage` → decoder → `parse*Message` yields the same
      message for every example.
- [x] No runtime dependencies; no Node-only APIs (`TextDecoder` is fine).
- [x] `bun run verify` passes.

## Out of scope

- Spawning processes, React, or any runtime/host logic.
- Changing the message set; if it looks wrong, say so in Handoff.

## Handoff

```
Branch/commit: t3/protocol-package @ 9637095 (implementation; this Handoff block is the next commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 0.8s
Done:
- packages/protocol: messages.ts (PROTOCOL_VERSION, all message types, parseHostMessage/parseRuntimeMessage), framing.ts (encodeMessage, createLineDecoder), index.ts re-exports; no dependencies.
- Validation is total: `{ ok: true, message } | { ok: false, error }`, where error is the first failure as `<field path>: <reason>` (`command.entry: expected string`). Unknown type, unknown fields at every level, non-JSON values, non-finite numbers and cycles are rejected.
- Decoder: byte-level line splitting (multi-byte UTF-8 and split surrogate pairs reassemble), 8 MiB default cap checked before the terminator arrives, whitespace-only lines ignored, and one `onError` then a silent stop for oversize / invalid UTF-8 / invalid JSON; `end()` reports a trailing partial line.
- 27 tests (74 repo-wide): every message type with a valid example and invalid cases asserting the exact path, the decoder cases above, and encode → decoder → parse for every example. index.test.ts pins the public surface and the no-dependency / no-`node:` rule.
- bun.lock gained the workspace entry for the new package.
Not done / risks:
- Message set implemented exactly as specified; no changes proposed to it. 0007/0008 consume this API as written.
- Strict unknown-field rejection also applies to nested objects (command, environment, error info, scene nodes); a future extra field is a protocol change rather than an ignored key.
- Leniency choices: whitespace-only lines are treated as blank (skipped, not an invalid-JSON error), and a CR before the LF counts toward maxLineBytes.
- docs/architecture.md `## Status` still says "packages arrive with M1 tasks"; left to the orchestrator since 0005/0008 also touch that file.
- Diff is ~1163 lines (tests ~600), above the rough 600-line task guidance; splitting the validator from the decoder would not have reduced it.
- bun.lock conflicts with the parallel runtime worker; resolve by rerunning `bun install`, never by hand.
```
