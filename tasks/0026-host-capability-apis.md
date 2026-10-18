---
id: "0026"
title: getApplications, openExtensionPreferences, Clipboard.readText
status: doing
milestone: M3
depends: []
---

## Goal

The remaining small host-backed APIs blocking curated commands work through
the capability broker: `getApplications` (4 commands blocked),
`openExtensionPreferences` (2), `Clipboard.readText` (1), plus the rest of
`Clipboard` (`read`, `paste`, `clear`) for completeness.

## Context

- Declarations in `compat/raycast-api/index.d.ts` (`getApplications(path?)`,
  `Application` shape, `openExtensionPreferences()`,
  `openCommandPreferences()`, `Clipboard.read/readText/paste/clear` and their
  options such as `offset`).
- Capabilities (deny by default, named in Handoff): `applications.list`
  `{ path? }` → `Application[]`; `preferences.open` `{ scope: "extension" |
  "command" }`; `clipboard.read` `{ offset? }` → `{ text?, file?, html? }`;
  `clipboard.clear`. `Clipboard.paste` reuses `clipboard.paste`.
- CLI defaults for headless runs: `applications.list` granted returning an
  empty list unless `--applications <file.json>` is given;
  `clipboard.read` granted returning text from `--clipboard <text>` (empty
  otherwise); `preferences.open` prints. Document flags in `--help`.
- Smoke runner: keep deny-all, but treat the CLI headless defaults above as
  the smoke broker for these read-only capabilities so commands that only
  read can render; record this policy in the smoke report header.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Other workers change Cache (0024) and bundling/smoke
  classification (0025) in parallel; coordinate on `scripts/corpus/smoke.ts`
  by touching only the broker setup there.

## Acceptance

- [ ] Runtime + broker tests for each API, denied and granted; CLI e2e for
      `--applications` and `--clipboard`.
- [ ] `bun run verify` passes.

## Out of scope

- Real OS application discovery or clipboard access (desktop client work).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
