# Terminal client (`packages/tui`)

OpenTUI client over the in-process host API, on Bun (decision 0007).

```bash
bun run tui <extensionDir> <command>
```

## Keys

| Key             | Effect                                                               |
| --------------- | -------------------------------------------------------------------- |
| typing          | search text (client filtering or the List's search handler)          |
| ↑ / ↓           | move the selection                                                   |
| Enter           | run the selected item's first action (or the view's own)             |
| Ctrl-K          | open the action panel; type to filter, Enter runs or opens a submenu |
| Esc             | close submenu/panel, else pop the view, else quit at root            |
| Ctrl-C          | quit (shuts the runtime child down)                                  |
| Enter / Esc     | confirm / dismiss an open Alert                                      |
| Ctrl-T / Ctrl-Y | toast primary / secondary action                                     |

Action `shortcut`s map when they are a direct `{ modifiers, key }` using only
ctrl/shift with a lowercase letter, digit, `enter`, `escape`, `space`,
`backspace`, `tab` or an arrow key. Platform-specific objects and cmd/opt
combinations are skipped; the client keys above take priority.

## Rendering

- Client filtering matches title, subtitle and keywords by case-insensitive
  substring and keeps section order; `filtering: false` disables it, a search
  handler owns filtering, and `throttle` delays the event by 200 ms.
- Only the active `Navigation.Entry` renders. `popToRoot({ clearSearchBar })`
  and `clearSearchBar()` clear the input; `closeMainWindow()` quits.
- `Detail` shows markdown source as plain text plus metadata lines;
  `List.Item.Detail` appears beside the list when `isShowingDetail`.
- Toasts and alerts stay while mounted; a HUD line shows for 2.5 s.
- Unknown node types render as `[Unsupported: <type>]`.

## Capabilities

Same session broker as `blast run` (`createSessionBroker`): storage, OAuth
tokens and the read-only headless defaults. The client adds session-local
`clipboard.*` and `open.url` handlers (see `docs/capabilities.md`); every
other effect stays denied.
