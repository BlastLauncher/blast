---
id: "0035"
title: Selection and file APIs; Form.FilePicker
status: doing
milestone: M3
depends: []
---

## Goal

`getSelectedText` (249 extensions), `getSelectedFinderItems`,
`getFrontmostApplication`, `showInFinder`, `trash`, and `Form.FilePicker`
(256) work through capabilities with deterministic headless defaults.

## Context

- Check every API in `compat/raycast-api/index.d.ts`.
- Capabilities (deny by default; name them in Handoff), e.g.
  `selection.text`, `selection.files`, `applications.frontmost`,
  `finder.show`, `trash`. Read-only ones get headless defaults in
  `packages/host/src/headless.ts` (used by `blast run` and the smoke broker):
  `getSelectedText` rejects like Raycast does when nothing is selected unless
  `--selected-text <text>` is given; selected files from
  `--selected-files <path>` (repeatable); frontmost app from
  `--frontmost <bundleId>` or a neutral default. Document flags in `--help`.
- `Form.FilePicker`: `allowMultipleSelection`, `canChooseDirectories`,
  `canChooseFiles`, `showHiddenFiles`, value `string[]`; integrates with the
  Form value model from task 0022 (`packages/runtime/src/api/form.ts`);
  the CLI's `field <id> <value>` accepts a comma-separated path list for
  file pickers.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Other workers: 0033 (curated v3) and 0034 (Action
  variants, `action.ts`) in parallel; avoid `action.ts`.

## Acceptance

- [ ] Runtime + host tests per API (granted, denied, defaults); FilePicker in
      a form submit; CLI e2e for the new flags.
- [ ] `bun run verify` passes.

## Out of scope

- Real OS selection/file dialogs.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
