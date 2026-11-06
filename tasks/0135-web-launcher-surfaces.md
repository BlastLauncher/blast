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
Branch/commit: t3/5b0bde01 @ c2c89ec (round 2, on top of round 1 7e3d8ad)
Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 86.1s`
Done:
- Alert is keyboard-complete: Enter confirms, Escape dismisses (no fall-through to back), Tab/Shift-Tab cycle inside `.alert`, primary button takes focus. The controller ignores `primary`/`move` while an alert is open, so the client sends `{ type: "alert" }` itself. An open dropdown owns arrows/Enter/Escape.
- Shared `feedback` fixture and `toast.json` restored to main. New browser fixtures `browser-grid` (2x3 cells), `browser-feedback` (alert answers rendered, toast action -> HUD "From action") and `browser-fields` (TextArea, Password, Dropdown, DatePicker, TagPicker, Separator, Description, FilePicker). `browser-keyboard` uses `accessories` and a titled `List.Section`.
- `site:e2e` (4 consecutive green runs): section header and count, subtitle/accessory, grid selection beer->wine->tea->cider->beer, dropdown filter hides non-matches + keyboard choose + Escape + mouse choose, alert via button/Escape/Enter, exact HUD text, form field JSON round-trip incl. TagPicker de-selection, phone-fit boxes for alert and dropdown.
- Markdown: links/images/code tokenized before emphasis; links and images are https only (images also `data:image`); `http:` links keep their label only. Unit tests for URL underscores, quotes, `javascript:`.
- Browser sweep re-run: 237 commands, 96 rendered (0133 baseline 93), 51 needs-preferences (unchanged), 74 empty (+2), network 0 (was 5). The delta is network availability and corpus state, not renderer changes.
Not done / risks:
- client-core does not expose `Form.Separator`/`Form.Description` in `view.form.fields` (`formFields` keeps only editable kinds), so the browser cannot draw them; they sit in the fixture and the render branches are inert. Exposing them is a client-core change, left for a follow-up.
- `accessory={{ text }}` is not a List.Item prop and client-core only reads `accessories`; with the singular form the row text is only title and subtitle (the new e2e fails with it, so round 1's claim that it rendered was wrong).
- Fixed in passing: Playwright `boundingBox()` returns x/y/width/height, so the round-1 phone-fit check compared `undefined` and never failed; selects no longer send `setValue` on `input` (it filtered a Dropdown to its own query); `browser-form` waits for the echoed name because a stale scene could overwrite typed text after Tab (client-core drafts are dropped per scene).
- Playwright deps were copied from the main checkout's `.cache` into this worktree's `.cache`; no download.
```
