# Terminal client (`packages/tui`)

```bash
bun run tui <extensionDir> [command] [--native]
```

A `[command]` opens it directly; otherwise the engine's root view lists commands. `--native` enables system clipboard/paste, URL/file opens, file-manager reveal and trash.

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

## Raycast parity checklist (0104)

- **Toasts** — done: success/failure dismiss after 3 seconds; animated stays until updated.
- **Action panels** — done: sections and labels; Ctrl-K opens, Ctrl-Enter runs the second action; Ctrl-C always quits, so copy actions run from the panel.
- **Form presentation** — done: `Description`, `Separator`, and `LinkAccessory` are non-focusable text (targets shown).
- **Navigation** — done: `navigationTitle` and `‹` back affordance; Esc performs semantic back.
- **Native window/clipboard** — terminal limitation; these remain embedder capabilities.
- **Pointer, animation, desktop layout** — not planned for this terminal client.

## Launcher

`bun run tui <extensionDir>` draws the engine's root view (`engine.root`,
decision 0014): commands with `title`, `subtitle` (else `description`) and
mode. The engine ranks, prompts and installs; the TUI draws its views.

- Typing searches title, subtitle and name; ↑ / ↓ move; Enter opens; Ctrl-K
  lists Open / Configure Command; Ctrl-E (⌃⇧, / ⌘⇧, where delivered) opens
  **Configure <command>**, saved without launching. Esc / Ctrl-C quit.
- The manifest is re-read while open (debounced `fs.watch`): edits show up
  live; a broken manifest shows `Manifest: …` and keeps the last good list.
- Launching runs `startLaunchFlow`: missing required preferences and arguments
  become one **Set up <command>** form; dependencies install as a progress
  view with Retry on failure (under `<dataDir>/deps/`, decision 0002).
- Esc at a command's root, a no-view command finishing and the crash screen
  return to the root, selection kept; the crash screen offers R to relaunch
  with the same arguments. `open*Preferences` returns and opens Configure.
  Ctrl-C quits from anywhere; the process exits 1 only if the last launched
  command crashed. `--native` handlers reach every launched command.

Prompt forms are ordinary form views (see Forms). Values persist in `<dataDir>/preferences/<encoded-name>.json` (**plaintext, mode 0600**). Data root: `$XDG_DATA_HOME/blast` (or `~/.local/share/blast`). Run `bun scripts/tui-benchmark.ts` for `hello-list` first-frame time and mean keystroke latency through a synthetic 10,000-item List; it uses OpenTUI's in-memory renderer, is outside `bun run verify`, and reports machine-dependent timing.

## Rendering

- Client filtering ranks matches (title, keywords, subtitle) and orders sections
  by best item unless `keepSectionOrder`; `filtering: false` disables it, a
  search handler owns filtering, and `throttle` delays the event by 200 ms.
- `List` and `Grid` share selection, filtering and primary-action handling;
  the active view's root type picks the renderer. Grid lays items out in rows
  of `columns` (default 5; a section's `columns` overrides it) with a header
  line per section; a cell shows its `content` as short text above
  title/subtitle, and `aspectRatio`, `fit` and `inset` are ignored.
- A `searchBarAccessory` dropdown (`List.Dropdown` / `Grid.Dropdown`) shows the
  current value's title next to the search bar; Ctrl-P opens its options
  (sections included) in a filterable panel, Enter sends `onChange` with the
  chosen value and Esc closes. The runtime owns the dropdown value.
- Only the active `Navigation.Entry` renders. `popToRoot({ clearSearchBar })`
  and `clearSearchBar()` clear the input; `closeMainWindow()` quits.
- `menu-bar` commands render their `MenuBarExtra` as a navigable menu:
  `title`/`tooltip` head the window, Sections are headers, and Items (title,
  subtitle, shortcut) select with ↑/↓. → / Enter opens a Submenu and ← / Esc
  closes it; Enter on an Item runs `onAction` with a `left-click` event, and
  Items without one render dimmed. Toasts and the HUD share the footer, and
  alerts open over the menu.
- `no-view` commands render only feedback (alert, toast, HUD). When runtime
  exits 0, client quits after HUD (2.5 s). Errors offer relaunch or back;
  direct exits 1.
- `List`/`Grid` pagination sends one `onLoadMore` per item-count change when the
  selection reaches the last loaded item (or Grid row) and `hasMore` is set;
  `isLoading` shows the loading line.
- `Detail` and `List.Item.Detail` render terminal markdown: headings, emphasis,
  lists, quotes, inline/fenced code and links (text plus a dimmed URL); other
  syntax stays visible as source. Metadata lines follow the detail.
- `List.EmptyView` and `Grid.EmptyView` show icon, title and description; without one an empty view says `No results`.
- Raycast `Icon.*` names map to compact glyphs (`✓`, `⚙`, `★`, …); unknown icons
  and images fall back to a short label or `▣`, and images are never fetched.
  Icon tints resolve through the theme palette; `NO_COLOR` drops all attributes.
- Alerts stay while mounted; a HUD line shows for 2.5 s.
- Loading uses one `◌ Loading…` footer indicator; a runtime failure shows the
  message, the last log line (or `No runtime log output.`) and `R Relaunch ·
  Esc/B Back` (or `Press Esc/B to go back` for a direct command).
- Unknown node types render as a dimmed `Unsupported view: <type>` notice (Form
  fields: `Unsupported field: <type>`); the raw `[Unsupported: <type>]` text
  stays in client-core row `text` and is logged once per type on stderr.

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
  Esc goes back/quits.
