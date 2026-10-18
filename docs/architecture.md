# Architecture

Current shape only; history lives in git. Decisions: `docs/decisions/`.

```
client (blast CLI today; desktop later)
   │  in-process API
host ── bundles extension (esbuild), spawns runtime, capability broker
   │  NDJSON over stdio  (packages/protocol)
runtime (one Node process per command)
   ├─ React reconciler → scene snapshots
   └─ @raycast/api shim → capability requests for privileged calls
extension code (unmodified, bundled)
```

## Packages

| Package             | Owns                                             | Depends on      |
| ------------------- | ------------------------------------------------ | --------------- |
| `packages/protocol` | message types, validation, NDJSON framing        | nothing         |
| `packages/runtime`  | reconciler, `@raycast/api` shim, child entry     | protocol, react |
| `packages/host`     | bundling, process lifecycle, broker, `blast` CLI | protocol        |

`host` never imports `runtime` code; it only spawns its entry file.

## Message flow

1. host → `init` (protocol version, command, preferences)
2. runtime → `ready`, then `scene` after every commit
3. host → `event` for user input (handler reference + args)
4. runtime → `capability.request`; host → `capability.result`
5. host → `shutdown`, or the process exits/crashes and the host reports it

## Status

M0 tooling only; packages arrive with M1 tasks (see `PLAN.md`).
