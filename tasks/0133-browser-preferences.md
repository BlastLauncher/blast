---
id: "0133"
title: Browser demo preferences (defaults, required-preference form, preferences.open)
status: doing
milestone: M8
depends: ["0132"]
---

## Goal

The browser demo runs commands with the same preference values as desktop:
manifest defaults are applied, and a command whose required preferences have no value
(API keys, usernames) shows a Raycast-style preferences form first, instead of
an empty view or an "API key missing" error. Values persist per browser.

## Context

- Today `examples/browser-demo/client.ts` sends `init` with `preferences: {}`.
  Even manifest defaults are missing: desktop merges them in
  `packages/host/src/session.ts` (`preferenceDefaults`, from
  `packages/host/src/bundle.ts`).
- Desktop rules to copy exactly are in `preferences()` in
  `packages/host/src/extension.ts`:
  - fields are extension preferences, then command preferences, deduplicated by name;
  - stored values are `{ ...extension, ...commands[name] }`;
  - a field is missing when it is required, has no default, and its value is
    undefined or `""`.

  Pull this into a pure, browser-safe helper that both desktop and the demo
  import. `parsePreferences` and `Preference` live in `bundle.ts`, which
  imports esbuild and node built-ins. Move them, plus the defaults and missing
  logic, into a new module with no node imports (for example
  `packages/host/src/preference-fields.ts`). Re-export them from `bundle.ts` so
  existing imports keep working.

- The TUI already has a preferences form (`packages/tui/src/preferences.tsx`)
  and a launch gate. Use them as a behaviour reference for field types and
  scope. The demo renders HTML through `examples/web-launcher/render.js` and
  `examples/browser-demo/demo.css`. Match the existing Raycast-like look: form
  rows, footer buttons (`footerButton`), dark theme.
- **Storage.** Use localStorage on the host page, key
  `blast:<ext>:preferences` (see `storage.*` in
  `examples/browser-demo/capabilities.ts` for key naming and the
  memory fallback). It holds `{ extension, commands }`, the same shape as the
  desktop store. Values reach the sandbox only through `init.preferences`;
  decision 0013 keeps all host state out of the sandbox origin.
- **`preferences.open`** is currently denied in `capabilities.ts`. It should open the form
  for that scope (`extension` or `command`). Saving relaunches the command.
- **Field types.**
  - Support textfield, password (masked input), checkbox, and dropdown (`data`).
  - Do not support file, directory and appPicker. If a required one has no
    default, the form shows a clear "needs a file on your computer; not
    available in the browser" message and no Run button.
- The form says the values stay in this browser only.
- **Sweep.** `examples/browser-demo/browser-sweep.ts` needs a new outcome,
  `needs-preferences`, recorded when the form appears. Re-run it and
  regenerate `compat/BROWSER-SWEEP.md` and `compat/browser-sweep.json` with its
  script; never edit them by hand. Defaults alone may turn some empty or error
  commands into rendered ones. Report the before and after totals.
- **Fixtures.** Add a fixture extension under `fixtures/extensions/` with a
  required password preference, a defaulted dropdown, and a command that
  renders the values it got. Wire it into `site.ts --fixtures` the way
  `browser-storage` is wired.

## Acceptance

- [ ] Unit tests for the shared helper:
  - defaults are applied;
  - a command value overrides an extension value;
  - missing means required, no default, and an empty or absent value;
  - fields are deduplicated by name.

  `packages/host/src/extension.ts` uses the helper, and the existing desktop
  preference tests still pass unchanged.

- [ ] Unit tests for the browser preference store:
  - reads and saves the extension and command scopes;
  - per-extension isolation;
  - a corrupt JSON value is treated as empty, without throwing;
  - the memory fallback works when localStorage throws.
- [ ] `bun run site:e2e` drives the fixture:
  - the form appears;
  - Run is disabled until the required field is filled;
  - after filling it, the command renders with that value and the dropdown default;
  - reloading the page and relaunching shows no form;
  - the extension calls `openExtensionPreferences()` and the form opens prefilled.

  The form's footer buttons are clickable, Cmd/Ctrl+Enter submits, and Escape
  goes back to the root list.

- [ ] A required file preference with no default shows the "not available in
      the browser" message. Covered by a unit or e2e test.
- [ ] The phone viewport e2e (390×844) shows the form with no horizontal scroll,
      and the footer is inside the viewport.
- [ ] The sweep was regenerated with the `needs-preferences` outcome. Handoff
      gives the before and after totals.
- [ ] `bun run verify` passes.

## Out of scope

- Do not put preference values or any host storage in the sandbox origin.
- Do not change the desktop preference store format or file location.
- Do not encrypt the stored values (it is a demo, and the form says where
  values live).
- No OAuth flows, and no file pickers for file or directory preferences.
- Do not change the TUI.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/browser-preferences @ HEAD
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 69.4s
Done:
- Shared browser-safe preference parsing, defaults, deduplication, and missing-value logic with desktop re-exports.
- Browser-local preference store, required-preference form, supported field types, preferences.open, persistence, and fixture e2e coverage.
- Added needs-preferences sweep classification and regenerated browser sweep reports.
- Sweep totals: round-1 baseline rendered 138, empty 76; current rendered 93, empty 72, needs-preferences 51 across 237 commands.
Not done / risks: Preference-bearing catalog commands use the source path after saving so the browser can load their complete manifest; initial launch uses the prebuilt manifest and form.
```
