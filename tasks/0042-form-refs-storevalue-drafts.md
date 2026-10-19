---
id: "0042"
title: Form field refs, storeValue and drafts
status: review
milestone: M3
depends: []
---

## Goal

Form field refs (`focus`, `reset`, `Form.ItemReference`), `storeValue`
persistence and `Form.Props.enableDrafts` drafts work, so the remaining
`Form*` partials become covered.

## Context

- Gaps: non-covered, non-deprecated `Form*` entries in
  `compat/raycast-api.json` (~43, incl. partials from task 0038).
- Form model: `packages/runtime/src/api/form.ts`. Fields are function
  components today; refs need `forwardRef` + `useImperativeHandle`. `focus()`
  records focus in the scene (e.g. `autoFocus`-like `focused: true` on the
  active field, one at a time) and fires `onFocus`/`onBlur` with `Form.Event`;
  `reset()` restores `defaultValue` (or the empty initial) and fires
  `onChange` like Raycast.
- `storeValue`: reuse the internal storage scope from task 0039
  (`packages/runtime/src/api/dropdown.ts`, scope `blast:dropdown`, host
  `packages/host/src/storage.ts` `internal` root). Generalize the scope name
  to something like `blast:internal` with key prefixes per feature, without
  breaking the dropdown tests (migrate them). Values: string, boolean,
  string[], dates as ISO strings. Controlled `value` wins; the restored value
  applies only when no `defaultValue`… check Raycast docs in the declarations
  and follow them exactly. Store on change; PasswordField never stores.
- Drafts: when `enableDrafts` is true on a root `Form`, field values are
  saved (same internal storage) on change and restored on the next launch;
  launch props carry `draftValues` when a draft exists (check
  `LaunchProps.draftValues` in the declarations). Submit via
  `Action.SubmitForm` clears the draft. PasswordField never drafts.
- CLI e2e in `packages/host/src/cli.test.ts`: two runs with the same
  `--data-dir` show the restored value. Update `docs/architecture.md` (Forms
  section) and `docs/cli.md` if behaviour visible there changes.
- `@covers`, `compat:report`, `fmt`. Parallel workers: 0043 (AI/Browser/Tool)
  and 0044 (window management + leftovers); keep to Form files and storage.

## Acceptance

- [x] Runtime tests: ref focus/reset per field kind, storeValue restore,
      draft save/restore/clear-on-submit, PasswordField never persisted.
- [x] CLI e2e for storeValue and drafts across two runs.
- [x] No non-deprecated `Form*` path missing; partials explained in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Real keyboard focus in a UI client.

## Handoff

```
Branch/commit: t3/form-refs-draft-values @ 1edccc89b9d398d24f0bffa39d6a63119a495ff3
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 45.5s
Done:
- All eight field refs focus/reset; focus is exclusive with ordered blur/focus events.
- Internal storeValue storage preserves typed values; controlled values win over stored values, which override defaults. Late reads never replace edits/resets.
- Root drafts restore fields and typed LaunchProps.draftValues through init; successful submit clears drafts, failed submits retain them, and shutdown waits for write acknowledgements. Passwords never persist.
- Runtime tests and three-launch CLI e2e cover restoration, password privacy, submit clearing, and retained storeValue; regenerated compat has zero missing non-deprecated Form paths. Docs updated; no dependencies added.
- Baseline CLI provider test exceeded its 5s budget for six processes; raised only that test to 15s. Fast-forward of round-2 WIP was impossible after 0044 integration, so cherry-picked 60ad346 as 2d20adb instead.
Not done / risks:
- Four existing partials remain: Form.Dropdown, Form.Dropdown.Props.filtering, Form.Dropdown.Props.filtering.keepSectionOrder, Form.Dropdown.Props.onSearchTextChange. Scene props/callbacks work; actual option filtering, section ordering and search throttling await a UI client.
- Real keyboard focus is out of scope. Pushed/nested forms do not draft, matching declaration limitations. Persistence is best effort on a crash or forced termination.
- Worker did not push or merge integration. Ready for independent review.
```
