---
id: "0024"
title: Cache class with per-extension on-disk storage
status: review
milestone: M3
depends: []
---

## Goal

`Cache` from `@raycast/api` works — it blocks 13 of the 25 failing curated
commands (mostly via `@raycast/utils` hooks such as `useCachedState` and
`useCachedPromise`).

## Context

- Declarations: `compat/raycast-api/index.d.ts` line ~1145 (`class Cache`,
  `STORAGE_DIRECTORY_NAME`, `DEFAULT_CAPACITY`, constructor options
  `namespace` and `capacity`, `get/set/has/remove/clear/isEmpty/subscribe`).
  The API is synchronous, so it cannot use async capabilities: the runtime
  reads and writes files itself, inside a directory the host assigns.
- Host: give every session a stable per-extension `supportPath` (and a cache
  directory derived from it) under the data dir from task 0021
  (`<dataDir>/support/<extension>/`), created by the host before spawning,
  passed via `init.environment`. Today the default `supportPath` lives next to
  the temporary bundle — fix that. The extension name is path-escaped the same
  way as storage files.
- Runtime `Cache`: entries persisted under
  `<supportPath>/<STORAGE_DIRECTORY_NAME>/<namespace?>`, LRU eviction by
  total byte size against `capacity` (default `DEFAULT_CAPACITY` — read the
  value from Raycast's docs if not in the declarations and cite it),
  `subscribe` notifies on set/remove/clear within the process. Writes are
  atomic. Document the trust point in decision 0001's capability notes: the
  runtime has direct file access only inside its assigned directories.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`; Handoff gives rendered count before (41/66) and after.
- Other workers change bundling (0025) and capability APIs (0026) in
  parallel; avoid `packages/host/src/bundle.ts` and the clipboard/app files.

## Acceptance

- [x] Tests: persistence across two runtime processes, namespaces, eviction,
      subscribe, clear; host creates and passes the per-extension directory.
- [x] `bun run verify` passes.

## Out of scope

- Sandboxing file access beyond the assigned directories (later OS-level
  work).

## Handoff

```
Branch/commit: t3/cache-api @ 3d1ab6f1ff2029ac131371d489d15c0aa1356f07 (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 27.4s
Done:
- Implemented synchronous persistent Cache, atomic replacement, UTF-8 byte LRU,
  namespaces, clear/remove, and process-local subscriptions across instances.
- Host creates stable escaped per-extension support paths; CLI --data-dir applies.
- Added deterministic Cache and two-runtime-process tests; 269 tests pass.
- Generated coverage and smoke reports: rendered commands improved from 41/66
  to 52/66; remaining outcomes: 3 crashed, 2 unsupported-mode, 9 unsupported-api.
- Documented direct filesystem trust; removed corpus checkout; no new dependencies.
Not done / risks: Concurrent mutations from separate processes are not serialized
  and can lose updates. Filesystem access is not sandboxed. The default capacity
  is 10 * 1024 * 1024 bytes, based on the vendored Cache.Options.capacity docs
  specifying 10 MB. Other workers' files were avoided; regenerate reports on merge.
```
