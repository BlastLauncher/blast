# Terminal client (`packages/tui`)

```bash
bun run tui <extensionDir> [command]
```

With a `<command>` this opens that command directly (direct mode); without
one, the picker lists the manifest's commands.

## Keys

| Key             | Effect                                                                |
| --------------- | --------------------------------------------------------------------- |
| typing          | search text (client filtering or the List's search handler)           |
| ↑ / ↓           | move the selection                                                    |
| ← / →           | move within a Grid row; open (→) or close (←) a Submenu in a menu bar |
| Enter           | run the selected item's first action (or the view's own)              |
| Ctrl-K          | open the action panel; type to filter, Enter runs or opens a submenu  |
| Ctrl-P          | open the search-bar dropdown accessory; type to filter its options    |
| Esc             | close dropdown/submenu/panel, else pop the view, else quit at root    |
| Ctrl-C          | quit (shuts the runtime child down)                                   |
| Enter / Esc     | confirm / dismiss an open Alert                                       |
| Ctrl-T / Ctrl-Y | toast primary / secondary action                                      |

Action shortcuts support direct ctrl/shift keys; client keys take priority.

## Picker

`bun run tui <extensionDir>` lists the manifest's commands for the session. Rows
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

Required preferences without defaults open a form before launch. Ctrl-E edits
all preferences of the selected command; extension requests to open preferences
return to the picker form. Text/file/directory/app fields take text, passwords
are masked, Space toggles checkboxes and ←/→ cycles dropdowns. Enter saves,
Esc cancels. Values persist in `<dataDir>/preferences/<encoded-name>.json`,
a **plaintext, mode 0600** file, with command values scoped by command name.
The data root is `$XDG_DATA_HOME/blast` (else `~/.local/share/blast`).

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
  `onLoadMore` per item-count change; `isLoading` shows the loading line.
- `Detail` shows markdown source as plain text plus metadata lines;
  `List.Item.Detail` appears beside the list when `isShowingDetail`.
- Toasts and alerts stay while mounted; a HUD line shows for 2.5 s.
- Unknown node types render as `[Unsupported: <type>]`.

## Forms

Forms show labels, help and errors. Tab / Shift-Tab move through fields; ↑ / ↓
do the same outside TextArea. Scene focus requests reach the runtime.

- TextField edits one line; TextArea uses Enter for newlines and ↑ / ↓ for
  its cursor. Ctrl-Enter or Ctrl-S submits from any field.
- Enter runs the primary action outside TextArea and pickers. Ctrl-K opens
  the form's action panel; Enter there runs the chosen action.
- Space toggles Checkbox. In Dropdown / TagPicker, ← / → moves the option
  cursor and Enter / Space selects; TagPicker toggles multiple values.
- DatePicker accepts an ISO date or date/time (empty clears); invalid text
  shows an error and never reaches the extension. FilePicker accepts paths
  separated by commas; single-selection fields keep the first path.
- PasswordField always shows a fixed mask when set and never echoes typed
  characters. Typing replaces an existing runtime-only password because its
  prior value is unavailable to the client; Backspace edits the new input.
- Runtime values own field state, including controlled values, stored values
  and restored drafts. The client sends edits and SubmitForm events; the
  runtime persists enabled drafts and clears them after successful submission.

Esc goes back/quits. Description, Separator and LinkAccessory render as text.
