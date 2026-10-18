---
id: "0021"
title: LocalStorage persistence and open()
status: review
milestone: M3
depends: []
---

## Goal

`LocalStorage` (`getItem`, `setItem`, `removeItem`, `allItems`, `clear`;
~935 extensions) persists per extension across runs, and `open(target,
application?)` (928) works through the capability broker.

## Context

- Persistence lives in the host, not the extension process: add capabilities
  `storage.get|set|remove|all|clear` handled by a host-side store keyed by
  extension name, stored as JSON under a configurable data directory
  (default: `$XDG_DATA_HOME/blast/storage/<extension>.json`, tests use a temp
  dir). Writes are atomic (write temp + rename). Values follow the
  declarations' `LocalStorage.Value` types.
- Storage is granted by default for the extension's own namespace (it cannot
  name another extension) — the host derives the key from the session, never
  from params. Record this in `docs/decisions/0001-*.md` capability notes or a
  short new decision.
- `open(target, application?)` → capability `open.url` (URLs) or
  `open.path` (files), denied unless granted; CLI `--grant open.url` prints.
- CLI: `--data-dir` option; storage works in `blast run` by default.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke` (stay 13/13),
  commit reports after `bun run fmt`. Other workers change toast/alert (0019)
  and list/action (0020) in parallel; avoid their files.

## Acceptance

- [x] Tests: values persist across two sessions of the same extension and are
      isolated between extensions; atomic write; `allItems`/`clear`; `open`
      denied vs granted.
- [x] `bun run verify` passes.

## Out of scope

- `Cache` class, `environment.supportPath` file APIs, OAuth token storage.

## Handoff

```
Branch/commit: t3/storage-open @ a0fca07 (implementation)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 14.5s
Done:
- Host store `packages/host/src/storage.ts`: `createStorage` + `storage.get|set|remove|all|clear` handlers, one JSON file per extension at `<dataDir>/storage/<extension>.json` (default `$XDG_DATA_HOME/blast`), values limited to `string|number|boolean`, atomic temp+rename writes serialized per session, unreadable stores fail the request instead of being overwritten.
- The extension name is fixed when the session starts: handlers only read `key`/`value` from params (test injects `extension`/`extensionName`/`dataDir` params and asserts the session's own file is written and no other file appears).
- Runtime `LocalStorage` (getItem/setItem/removeItem/allItems/clear, null→undefined for missing keys, key/value validation) and `open(target, application?)` → `open.url` for URLs (`file:` counts as a file) or `open.path` for files, with the application passed as a JSON identifier.
- CLI: storage handlers are installed by default for the session's extension (they override any `--grant storage.*`); new `--data-dir <dir>` option documented in `--help`; `open.*` stays deny-by-default and `--grant open.url` prints the recorded request.
- Tests: store unit tests (two-session persistence, per-extension isolation, allItems/clear/remove, 25 concurrent writes with no lost updates and no temp leftovers, corrupt file, validation, path escaping, XDG default), runtime capability tests, and CLI e2e over the new `fixtures/extensions/storage` (state persists across two `blast run` processes; open.url granted while open.path stays denied).
- Docs: capability/trust notes added to `docs/decisions/0001` (point 8) and a "Local storage" section in `docs/architecture.md`; compat regenerated after `bun run fmt` (642/1534 non-deprecated, 41.9%, was 41.3%); `bun run corpus:smoke` 13/13 rendered; `.cache/raycast-extensions` deleted.
Not done / risks:
- Beyond the literal Goal I also aliased the five deprecated top-level helpers (`allLocalStorageItems`, `clearLocalStorage`, `getLocalStorageItem`, `removeLocalStorageItem`, `setLocalStorageItem`) since the declarations define them as `typeof LocalStorage.*`; they are tested and cost no extra behaviour.
- Only per-session serialization: two processes writing the same extension concurrently are last-write-wins (no cross-process lock). Sessions of one extension do not normally overlap.
- `storage.all`/`storage.clear` ignore params entirely; callers must not widen `--grant` for storage, because the CLI's storage handlers win over grants.
- `open.path` is only recorded/printed by the CLI; actually launching an OS opener is not implemented (same as `clipboard.copy`).
- Diff is ~950 lines including tests, fixture and reports, above the ~600-line task guideline.
```
