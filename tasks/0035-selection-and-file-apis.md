---
id: "0035"
title: Selection and file APIs; Form.FilePicker
status: review
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

- [x] Runtime + host tests per API (granted, denied, defaults); FilePicker in
      a form submit; CLI e2e for the new flags.
- [x] `bun run verify` passes.

## Out of scope

- Real OS selection/file dialogs.

## Handoff

```
Branch/commit: t3/selection-file-apis @ 480649b133c66a29ccf8f3371d65e44842ae4f7a (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 30.8s
Done:
- Implemented getSelectedText, getSelectedFinderItems, getFrontmostApplication, showInFinder and trash against vendored declarations, including PathLike inputs and host-response validation.
- Capabilities: selection.text, selection.files, applications.frontmost, finder.show, trash. Bare brokers deny all; headless handlers answer the three read-only capabilities. Finder/trash remain denied unless granted.
- Added --selected-text, repeatable --selected-files and --frontmost flags with deterministic defaults, help/docs and CLI e2e coverage.
- Added Form.FilePicker options and controlled/uncontrolled string[] values, focus/change events, form submit and comma-separated CLI field input (omit value to clear). Added coverage evidence; regenerated compat reports. No dependencies added; action.ts untouched.
- 334 tests pass with randomized seed 2937715541. Corpus smoke: 62 rendered, 1 completed, 2 capability-denied, 1 timeout, 0 unsupported-api; smoke reports unchanged after formatting. Deleted .cache/raycast-extensions.
Not done / risks: Real OS selection/dialogs remain out of scope. FilePicker refs and storeValue persistence retain the existing Form limitations (partial coverage). Headless frontmost fallback uses an empty path; synthetic selection does not inspect the real OS.
```
