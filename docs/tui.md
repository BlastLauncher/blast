# TUI Client

A native terminal user interface for Raycast extensions. Commands render via
`@opentui/react` and `@opentui/core`. The TUI runs in two modes:

- **Direct mode**: `blast run <command-name>` launches the named command
  directly (the existing path).
- **Picker mode**: `blast run` (no command argument) starts on the extension's
  command list, lets the user search and pick a command, provides argument
  forms and manages the terminal session across commands.

## Picker

When `blast run` targets an extension directory without a command argument, it
opens the picker. The terminal switches to an alternate screen buffer. Rows
show each command's `title` (else its name), `subtitle` (else `description`)
and mode; the header shows the extension's title.

- Typing filters case-insensitively on title, subtitle and name; ↑ / ↓ move
  the selection; Enter launches; Esc / Ctrl-C quit the TUI.
- The manifest is re-read while the picker is open (debounced `fs.watch` on
  `package.json`): command edits show up live. Invalid JSON or a missing
  `commands` array shows an inline error line and keeps the last good list.
- A command declaring `arguments` opens a small form first: `text` and
  `password` fields take typing (passwords are masked), `dropdown` cycles its
  `data` options with ← / →; Tab / ↑ / ↓ move between fields. Enter launches
  only once every required argument is filled, else an error line names what
  is missing; values reach the command like the CLI's `--argument`.
- Esc at a command's root view, a no-view command finishing and the crash
  error screen all return to the picker, selection kept; Ctrl-C quits from
  anywhere; a launch failure (bundling) stays on the picker with an error
  line. The process exits 1 only if the last launched command crashed and
  the user then quits.

The picker checks dependencies on open and when `package.json` or
`package-lock.json` changes. A status line shows the latest npm log; launches
wait for installation. Failures show inline and allow a shared-dependency
fallback launch. Installs live under `<dataDir>/deps/` (decision 0008).

Required preferences without defaults present a launch gate (`Set up <command title>`)
showing only the missing required fields; entering values and pressing Enter saves
and continues launch. Ctrl-E opens the full preferences view (`Preferences — <extension title>`)
showing all extension and command preferences organized under `Extension` and `<command title>`
sections (with required fields marked with `*` and the focused field's description rendered
below the control); Enter saves without launching, and Esc cancels. Extension requests
to open preferences (`preferences.open`) return to the picker's full preferences view,
respecting the requested `extension` or `command` scope. Text/file/directory/app fields
take text, passwords are masked, Space toggles checkboxes and ←/→ cycles dropdowns.
Values persist in `<dataDir>/preferences/<encoded-name>.json`, a **plaintext, mode 0600**
file, with command values scoped by command name. The data root is `$XDG_DATA_HOME/blast`
(else `~/.local/share/blast`).

## Rendering

- Client filtering matches title, subtitle and keywords by case-insensitive
  substring and keeps section order; `filtering: false` disables it, a search
  handler owns filtering, and `throttle` delays the event by 200 ms.
- `List` and `Grid` share selection, filtering and primary-action handling;
  the active view's root type picks the renderer. Grid lays items out in rows
  of `columns` (default 5; a section's own `columns` overrides it) with a
  header line per section; a cell shows its `content` as short text (image
  source name or a color) above title/subtitle, `aspectRatio`, `fit` and
  `inset` are ignored. ↑/↓ keep the column when crossing rows and sections,
  clamping into shorter rows.
- A `searchBarAccessory` dropdown (`List.Dropdown` / `Grid.Dropdown`) shows the
  current value's title next to the search bar; Ctrl-P opens its options
  (sections included) in a filterable panel, Enter sends `onChange` with the
  chosen value and Esc closes. The runtime owns the dropdown value.
- Only the active `Navigation.Entry` renders. `popToRoot({ clearSearchBar })`
  and `clearSearchBar()` clear the input; `closeMainWindow()` quits.
- `menu-bar` commands render their `MenuBarExtra` as a navigable menu: the
  `title`/`tooltip` head the window, Sections are headers, and Items (title,
  subtitle, shortcut label) are selectable with ↑/↓. → / Enter opens a
  Submenu and ← / Esc closes it; Enter on an Item runs its `onAction` with a
  `left-click` event, and Items without one render dimmed.
- `no-view` commands render only their feedback (alert, toast, HUD). When the
  runtime exits 0 on its own, the client quits after the HUD window has shown
  (2.5 s). A failed runtime shows
  the error and waits for Esc; direct mode then exits 1.
- `List`/`Grid` pagination: when the selection reaches the last loaded item
  (or the last Grid row) and `pagination.hasMore` is set, the client sends one
  `onLoadMore` when crossing the threshold.
- The `Toast` layer renders on top of the active view. A HUD is a Toast with
  style `HUD` that clears any view and waits 2.5 s before completion.
- Form controls: `TextField`, `PasswordField`, `TextArea` take text inputs;
  `Checkbox` toggles on Space/Enter; `Dropdown` selects with `Enter` or arrows;
  `DatePicker` is a placeholder. Form errors block submit; values are
  collected on primary action and passed to `onSubmit`.

## Shell & Environment

Commands run in an environment matching the desktop Raycast runtime:
`PATH` is resolved through the user's login shell via `shell-path`
(falling back to a default set of standard binary paths including
`/opt/homebrew/bin`, `/usr/local/bin`, `~/.nvm/versions/node/<v>/bin`),
so tools installed via Homebrew, fnm, nvm or standard package managers
are found without requiring Blast to be launched from a configured shell.
The working directory defaults to `~` (matching Raycast desktop behaviour;
overridden by extension-level `cwd` if configured).
