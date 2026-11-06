---
id: "0135"
title: Web launcher surfaces (rich rows, dropdown, alert, HUD, toast actions, form fields)
status: doing
milestone: M8
depends: ["0134"]
---

## Goal

The web renderer draws everything client-core's `ControllerView` exposes, so
extensions look and behave in the browser the way they do in the TUI.

## Context

- `examples/web-launcher/render.js` reads only part of `ControllerView`
  (`packages/client-core/src/controller.ts`). These are missing:
  - **Rows.** Rows render as `row.text`. Use the `RowView` fields instead:
    `title`, `subtitle`, `accessories`, `iconLabel`/`iconTint`, and section
    headers (`kind: "section"`, `count`). See `packages/client-core/src/icons.ts`
    for how icons resolve.
  - **Grid.** Draw `view.grid` cells with selection.
  - **Search bar dropdown.** `view.dropdown` (List/Grid `searchBarAccessory`):
    draw it, open it with the controller's `openDropdown`, filter with
    `dropdownQuery`, and choose with `chooseDropdown`.
  - **Alert.** `view.feedback.alert` (`confirmAlert`) is a blocking dialog.
    Without it, extensions that call `confirmAlert` hang. Draw it as a modal
    with primary and dismiss buttons and the remember checkbox, and wire it to
    `{ type: "alert", confirm, remember }`. Focus moves into the dialog and is
    trapped there; Escape dismisses it and Enter confirms.
  - **HUD.** `view.feedback.hud`: a small transient pill.
  - **Toast actions.** `toast.actions`: buttons that send `toastAction`, with
    their shortcuts shown. Toast styles: success, failure and animated
    (spinner).
  - **Form fields.** Every field renders as `<input>`. Use the `FormFieldView`
    kinds (`packages/client-core/src/form-view.ts`): text area, password,
    checkbox, dropdown (options with `optionMove` and `optionChoose`), date
    picker (native `<input type="date">`/`datetime-local` is fine), tag
    picker, separator, and description. File picker is out of scope and shows
    a "not available in the browser" note.
  - **Detail.** Render markdown with a small safe subset (headings,
    emphasis, code, lists, links, images limited to https and data URIs), plus
    detail metadata if the view exposes it. No raw HTML passes through.
- Match the existing Raycast-like CSS in `examples/browser-demo/demo.css` and
  keep the dark and phone layouts. 0134 made the frame patch in place, so keep
  focus stable.
- Add or extend fixtures under `fixtures/extensions/` that show each surface,
  wired through `site.ts --fixtures`.

## Acceptance

- [ ] e2e on the fixtures:
  - [ ] Rows show their subtitle and accessories, and section headers show.
  - [ ] Grid cells render, and the arrow keys move selection in two dimensions.
  - [ ] The dropdown opens, filters and chooses, and the extension receives
        `onChange`; the fixture shows the chosen value.
  - [ ] `confirmAlert` resolves true or false, depending on the button or key
        used.
  - [ ] HUD appears, and a toast action button runs its action.
  - [ ] Every supported form field kind round-trips its value through submit.
  - [ ] Detail markdown renders the subset, and a `<script>` in the markdown
        renders as text.
- [ ] Unit tests for the markdown subset, covering escaping and the URL
      allowlist.
- [ ] Phone viewport (390×844): the alert and dropdown fit inside the viewport.
- [ ] Re-run the browser sweep. Handoff gives the rendered count against the
      0133 baseline.
- [ ] `bun run verify` passes.

## Out of scope

- No changes to client-core semantics; if one is needed, write it in Handoff.
- No markdown or sanitizer dependency unless a small hand-rolled subset proves
  impossible. If one is needed, justify it in Handoff.
- No file picker or OAuth UI.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: worker @ pending
Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)`
Done:
- Rendered rich list rows, sections, grids, dropdowns, alerts, HUDs, toast actions, forms, and safe Detail markdown in the browser launcher.
- Added stable control ids and browser event routing for dropdown, alert, toast, grid, and form interactions.
- Wired grid and feedback fixtures into the fixture site and expanded browser e2e coverage, including phone viewport checks.
- Added markdown escaping and URL allowlist unit tests.
Not done / risks: Browser sweep rerun produced 95 rendered commands versus the 0133 baseline of 93; generated sweep reports were left unchanged because the difference is corpus/network variance.
```
