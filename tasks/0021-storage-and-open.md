---
id: "0021"
title: LocalStorage persistence and open()
status: doing
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

- [ ] Tests: values persist across two sessions of the same extension and are
      isolated between extensions; atomic write; `allItems`/`clear`; `open`
      denied vs granted.
- [ ] `bun run verify` passes.

## Out of scope

- `Cache` class, `environment.supportPath` file APIs, OAuth token storage.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
