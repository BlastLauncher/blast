---
id: "0086"
title: Corpus smokes supply placeholder arguments and preferences so every command runs
status: doing
milestone: M5
depends: []
---

## Goal

Commands that need launch arguments or required preferences without a
default no longer stop the corpus smokes as `needs-arguments` /
`needs-preferences`. The smokes launch them with deterministic placeholder
values and report what happens, so those commands count as real signal
(20 of 56 in `compat/SMOKE-DEPS.md`, and the 5 in `compat/SMOKE.md`).

## Context

- Runners:
  - `scripts/corpus/smoke-run.ts` and `smoke-deps.ts`, sharing
    `smoke-command.ts`;
  - `smoke.ts` (results, report);
  - `tui-smoke-run.ts`.
    Today a command with required arguments or required preferences without
    a default is bundled but not launched.
- Placeholder rules (deterministic, offline, documented in the report
  header):
  - text/password arguments: `"blast"`;
  - dropdown arguments: the first `data` value;
  - preference types:
    - `textfield`/`password`: `"blast-smoke"`;
    - `checkbox`: `false`;
    - `dropdown`: first option;
    - `appPicker`: `""`;
    - `file`/`directory`: a temp directory under the smoke data dir.
      Never use real credentials.
- Keep the original classification visible: add a `placeholders` field
  (`"arguments" | "preferences" | both`) to each result. The outcome is the
  real outcome with placeholders (rendered, crashed, network, …), so the
  report can show "rendered with placeholder preferences". Add report columns
  or sections accordingly. API-key preferences commonly lead to `network` or
  `crashed` (401 handling); that is acceptable data.
- Unit tests for the placeholder derivation, using manifest fixtures:
  arguments of each type, each preference type, and the extension-vs-command
  scope.
- Re-run `bun run corpus:smoke-deps` (network allowed in this explicit
  script) and commit the regenerated reports. Re-running `corpus:smoke`
  (80 extensions) is optional; if you do, commit its report too. Clean
  `.cache` afterwards (`rm -rf .cache/raycast-extensions` and the smoke
  data).
- Task 0087 (bundle timeout) runs in parallel and touches
  `smoke-command.ts`. Keep your edits there minimal, to the call site for
  launch values.

## Acceptance

- [ ] Placeholder unit tests pass.
- [ ] `compat/SMOKE-DEPS.md` has 0 `needs-arguments`/`needs-preferences`
      outcomes; Handoff lists the new outcome totals and which ones used
      placeholders.
- [ ] `bun run verify` passes; `.cache` is under 20 MB afterwards.

## Out of scope

- Fixing failures found (record them as candidates in Handoff), bundle
  timeouts (0087).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
