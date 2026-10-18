# `blast` debug CLI

Reference for the headless client agents use to run and drive extensions.
`bun run blast --help` is authoritative; keep this file in sync with it.

```bash
bun run blast run <extensionDir> <command> [options]
```

Bundles a command, runs it in a runtime child process, and prints every
published scene as a text tree (one node per line, handler props as
`[onAction]`). `# log` and `# capability` lines interleave for logs and
capability requests; token capabilities (`oauth.tokens.*`) are redacted.
`--json` emits the protocol messages as NDJSON instead.

## Options

- `--argument <name=value>` — manifest argument (repeatable; a missing
  required or unknown name is a usage error).
- `--grant <capability>` — grant a capability. A granted `clipboard.copy`
  records and prints the copied content instead of touching an OS clipboard; a
  granted `command.launch` records the request without starting a session.
  Everything not answered below, including `clipboard.paste` and
  `clipboard.clear`, `finder.show`, `trash`, `window.setBounds`, and
  `mcp.install`, needs `--grant` (records the request only).
- `--data-dir <dir>` — root for LocalStorage, OAuth tokens, support and
  internal (dropdown) storage. These need no grant.
- `--timeout <ms>` — bounds the run.

Headless answers for capabilities a desktop client owns:

| Capability                              | Flag                         | Default                                          |
| --------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `applications.list`                     | `--applications <file.json>` | empty list                                       |
| `applications.frontmost`                | `--frontmost <bundleId>`     | `{ name: "Headless", path: "" }`                 |
| `applications.default`, `window.active` | —                            | rejects: no default application or active window |
| `window.desktops`, `window.list`        | —                            | one empty desktop; no windows                    |
| `clipboard.read`                        | `--clipboard <text>`         | empty text; nothing at older offsets             |
| `selection.text`                        | `--selected-text <text>`     | rejects, like Raycast with no selection          |
| `selection.files`                       | `--selected-files <path>`    | empty list (flag repeatable)                     |
| `oauth.authorize`                       | `--oauth-code <code>`        | denied                                           |
| `preferences.open`, `command.metadata`  | —                            | answered and printed                             |

## Scripts

`--script <file|->` drives the run, one command per line (`#` comments):

- `action <title>` — run an action in the active view's action panel.
- `submenu <title>` — dispatch an `ActionPanel.Submenu`'s `onOpen`.
- `back`, `confirm`, `dismiss` — navigation pop, alert confirm/dismiss.
- `search <text>` — List/Grid `onSearchTextChange`.
- `more` — active List/Grid pagination `onLoadMore`; fails unless `hasMore`.
- `dropdown <value>` — List/Grid dropdown `onChange`.
- `field <id> <value>` — edit a Form field: strings; `true`/`false` for
  checkboxes; ISO strings for dates; comma-separated values for FilePicker and
  TagPicker (omit the value to clear).
- `submit` — run the first `Action.SubmitForm`.
- `wait` — wait for the next scene; `expect <text>` — fail unless the latest
  scene tree contains the text; `quit` — shut down with exit code 0.

Exit codes: 0 success, 1 script or expectation failure, 2 usage error,
3 extension crash, bundle failure (e.g. `MISSING_DEPENDENCY`) or protocol error.
