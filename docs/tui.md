# Terminal client (`packages/tui`)

OpenTUI client over the in-process host API, on Bun (decision 0007).

```bash
bun run tui <extensionDir> <command>
```

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

Action `shortcut`s map when they are a direct `{ modifiers, key }` using only
ctrl/shift with a lowercase letter, digit, `enter`, `escape`, `space`,
`backspace`, `tab` or an arrow key. Platform-specific objects and cmd/opt
combinations are skipped; the client keys above take priority.

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
  (2.5 s; a `hudDurationMs` prop shortens it in tests). A failed runtime shows
  the error and waits for Esc; `bun run tui` then exits 1.
- `List`/`Grid` pagination: when the selection reaches the last loaded item
  (or the last Grid row) and `pagination.hasMore` is set, the client sends one
  `onLoadMore` per item-count change; `isLoading` shows the loading line.
- `Detail` shows markdown source as plain text plus metadata lines;
  `List.Item.Detail` appears beside the list when `isShowingDetail`.
- Toasts and alerts stay while mounted; a HUD line shows for 2.5 s.
- Unknown node types render as `[Unsupported: <type>]`.

## Capabilities

Same session broker as `blast run` (`createSessionBroker`): storage, OAuth
tokens and the read-only headless defaults. The client adds session-local
`clipboard.*` and `open.url` handlers (see `docs/capabilities.md`); every
other effect stays denied.

## Forms

Forms show labelled fields, help text, errors and placeholders. Tab / Shift-Tab
move through editable fields; ↑ / ↓ do the same outside TextArea. Scene focus
requests are honored and focus/blur events go back to the runtime.

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

Esc keeps its normal back/quit behaviour. Description, Separator and
LinkAccessory render as text; FilePicker does not open an OS dialog.
