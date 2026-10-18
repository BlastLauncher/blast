---
id: "0026"
title: getApplications, openExtensionPreferences, Clipboard.readText
status: review
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

- [x] Runtime + broker tests for each API, denied and granted; CLI e2e for
      `--applications` and `--clipboard`.
- [x] `bun run verify` passes.

## Out of scope

- Real OS application discovery or clipboard access (desktop client work).

## Handoff

```
Branch/commit: t3/host-capability-apis @ da7e17d
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 21.3s
Done:
- Runtime: `getApplications` (`applications.list { path? }` → applied
  `Application`s), `openExtensionPreferences`/`openCommandPreferences`
  (`preferences.open { scope }`), `Clipboard.read`/`readText`
  (`clipboard.read { offset? }`, offsets 0–5 validated), `Clipboard.paste`
  (reuses `clipboard.paste`, now shared with `Action.Paste`) and
  `Clipboard.clear` (`clipboard.clear`); all denied unless the host grants.
- Host: `headless.ts` (`createHeadlessHandlers` + `parseApplications`) is the
  single source of the read-only defaults, used by `blast run` and the smoke
  broker; CLI flags `--applications <file.json>` and `--clipboard <text>`
  documented in `--help`, a bad file is a usage error (exit 2).
- Tests: runtime per API (granted/denied/malformed), broker loop for the four
  new capabilities, host defaults/parser, CLI e2e through the new
  `fixtures/extensions/host-apis`; `fixtures/runtime/unsupported.js` now uses
  `showInFinder` (still unsupported) for the fatal-event tests.
- `bun run corpus:smoke`: 41/66 → 48/66 rendered, exactly the 7 commands these
  APIs blocked (menucloak ×4 `getApplications`, storybook-sandboxes ×2
  `openExtensionPreferences`, invisible-text-detector ×1 `Clipboard.readText`);
  report header records the broker policy.
- `bun run compat:report`: non-deprecated 50.8% → 51.6% (779 → 791 covered:
  `getApplications`, both `open*Preferences`, `Clipboard.read/readText/paste/
  clear`, `Application`, `Clipboard.ReadContent.*`; `Clipboard` and
  `Clipboard.Content` partial).
Not done / risks:
- `Clipboard.Content` stays partial: only `{ text }` crosses the wire; `{ file }`
  and `{ html }` throw as before (real OS clipboard access is out of scope).
- `readText` maps the wire's empty text to `undefined` (Raycast's "no text"); a
  command launched without `--clipboard` therefore sees no text.
- `clipboard.paste`/`clipboard.clear` and `open.*` stay denied by default — the
  smoke broker grants nothing else, and no further smoke command moved.
- `compat/` reports were regenerated on this branch alone; 0024/0025 regenerate
  theirs on merge.
```
