# Terminal client (`packages/tui`)

```bash
bun run tui [--popup | --popup-daemon] [--native] [--no-builtin] <extensionDir>...
bun run tui [--native] <extensionDir> <command>
bun run tui --version
```

The root view lists commands from every given extension plus the built-in `tmux`
and `tpm` extensions (`--no-builtin` omits built-ins). One directory plus a
`<command>` name (not a directory) opens that command directly. `--popup`
quits when a command closes the window; `--popup-daemon` detaches inside its
inner tmux server (`@blastlauncher/tui` installs `blast-tui`, Bun required).
`--native` enables real OS handlers; without it, clipboard ops are session-local
and `open.url` only records URLs.

## tmux palette

[tmux-blast](https://github.com/BlastLauncher/tmux-blast) opens `blast-tui` on
<kbd>Ctrl</kbd>+<kbd>Space</kbd> (tmux 3.2+, Bun required, runs
`bunx @blastlauncher/tui@next`). With
[TPM](https://github.com/tmux-plugins/tpm), add
`set -g @plugin 'BlastLauncher/tmux-blast'` to `~/.tmux.conf` and press
<kbd>prefix</kbd> <kbd>I</kbd>. Options (`@blast-key`, `@blast-daemon`,
`@blast-theme`, …) live in the [plugin README](../examples/tmux-plugin/README.md).

The built-in `tmux` extension (`packages/tui/extensions/tmux`) targets the pane
where the key was pressed (`BLAST_TMUX_TARGET`, else tmux `{last}`). Built-in
commands cover panes (split, close, swap, zoom, break, find, move, rename),
windows (new, next/prev/last, close, rename), sessions (new, choose, detach,
rename, kill), config reload, and TPM plugin management (`install`, `update`,
`clean`, `manage`). Destructive actions confirm first.

## Keys

| Key             | Effect                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| typing          | search text (client filtering or List search handler)                        |
| ↑ / ↓           | move selection (List also maps `Ctrl-P`/`Ctrl-K` up, `Ctrl-N`/`Ctrl-J` down) |
| ← / →           | move within a Grid row; open (`→`) or close (`←`) a menu-bar Submenu         |
| Enter           | run primary action (`Ctrl-Enter` / `Cmd-Enter` runs second action)           |
| Ctrl-A          | open the action panel; type to filter, `Enter` runs or opens submenu         |
| Ctrl-P          | open search-bar dropdown accessory; type to filter options                   |
| Ctrl-E          | open **Configure &lt;command&gt;** at the root                               |
| Esc             | close alert/dropdown/submenu/panel, else pop view, else quit at root         |
| Ctrl-C          | quit (copy actions run from the action panel)                                |
| Enter / Esc     | confirm / dismiss an open Alert                                              |
| Ctrl-T / Ctrl-Y | toast primary / secondary action                                             |

## Launcher

`bun run tui <extensionDir>...` draws `engine.root` (decision 0014):

- Manifests reload live via `fs.watch`; broken JSON shows `Manifest: …` and
  keeps the last good command list.
- Launching runs `startLaunchFlow`: missing required preferences and arguments
  open one **Set up** form; dependencies install under `<dataDir>/deps/` with a
  progress toast and Retry on error.
- `Esc` at a command's root, a finished `no-view` command, or the crash screen
  (`R` relaunches) returns to the root with selection kept. In `--popup` mode,
  `closeMainWindow()` or a finished `no-view` command exits `0`.
- Saved preferences live in `<dataDir>/preferences/<encoded-name>.json`
  (plaintext, mode 0600; `<dataDir>` defaults to `$XDG_DATA_HOME/blast`).

`bun scripts/tui-benchmark.ts` (outside `verify`) benchmarks `hello-list` first
frame, 10k-item keystroke latency, and cold/warm `--popup` startup using
`<dataDir>/bundles/` and `<dataDir>/compile-cache/`.

## Rendering

- Client filtering ranks matches (title, keywords, subtitle) and orders sections
  by best item unless `keepSectionOrder`; `filtering: false` or `onSearchTextChange`
  disables it, and `throttle` delays search events by 200 ms.
- `List` and `Grid` share selection, filtering, and pagination (`onLoadMore`
  fires once per item-count change at the last item/row when `hasMore` is set).
  Grid uses `columns` (default 5) and ignores `aspectRatio`, `fit`, and `inset`.
- `List.Dropdown` / `Grid.Dropdown` (`searchBarAccessory`) opens with `Ctrl-P`;
  the runtime owns the selected value.
- `menu-bar` commands render `MenuBarExtra` as a navigable menu; items without
  `onAction` render dimmed. `no-view` commands show feedback only and quit
  after their HUD (`2.5 s`).
- `Detail` and `List.Item.Detail` render terminal Markdown (headings, emphasis,
  lists, quotes, code, links) followed by metadata.
- Raycast `Icon.*` names map to compact glyphs (`✓`, `⚙`, `★`, …); unknown
  icons and images fall back to a short label, `◇`, or `▣` (images are never
  fetched). `NO_COLOR` disables all color attributes.
- Errors show the message, last log line, and `R Relaunch · Esc/B Back`.
  Unknown nodes show `Unsupported view: <type>` (`Unsupported field: <type>` in
  forms) and log once on stderr.

## Forms

`Tab` / `Shift-Tab` move through fields (`↑` / `↓` do the same outside
`TextArea`); `Ctrl-S` or `Ctrl-Enter` submits from any field, and `Ctrl-A`
opens the form's action panel. `Enter` submits outside `TextArea` and pickers.

- `Space` toggles `Checkbox`. In `Dropdown` / `TagPicker`, `←` / `→` moves the
  option cursor and `Enter` / `Space` selects or toggles values.
- `DatePicker` accepts ISO dates or date/times (empty clears); invalid text
  shows an error locally. `FilePicker` takes comma-separated paths.
- `PasswordField` shows a fixed mask and never echoes typed characters; typing
  replaces an existing runtime-only password.
- Runtime state owns controlled values, `storeValue`, and enabled drafts
  (cleared on successful submit).
