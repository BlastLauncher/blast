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
  records and prints the copied text instead of touching an OS clipboard; a
  granted `command.launch` records the request without starting a session.
  Everything not answered below, including `clipboard.paste` and
  `clipboard.clear`, `finder.show` and `trash`, needs `--grant`.
- `--data-dir <dir>` — root for LocalStorage, OAuth tokens, support and
  internal (dropdown) storage. These need no grant.
- `--timeout <ms>` — bounds the run.

Headless answers for capabilities a desktop client owns:

| Capability                             | Flag                         | Default                                 |
| -------------------------------------- | ---------------------------- | --------------------------------------- |
| `applications.list`                    | `--applications <file.json>` | empty list                              |
| `applications.frontmost`               | `--frontmost <bundleId>`     | `{ name: "Headless", path: "" }`        |
| `clipboard.read`                       | `--clipboard <text>`         | empty text; nothing at older offsets    |
| `selection.text`                       | `--selected-text <text>`     | rejects, like Raycast with no selection |
| `selection.files`                      | `--selected-files <path>`    | empty list (flag repeatable)            |
| `ai.ask`                               | `--ai-answer <text>`         | denied                                  |
| `browser.tabs`, `browser.content`      | `--browser-tabs <file.json>` | denied                                  |
| `oauth.authorize`                      | `--oauth-code <code>`        | denied                                  |
| `preferences.open`, `command.metadata` | —                            | answered and printed                    |

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

`--browser-tabs` reads a JSON array with integer `id`, string `url`, boolean
`active`, and optional string `title`, `favicon`, `content`. Tab IDs must be unique.
Content defaults to the first active tab, or uses the requested `tabId`; missing
content rejects. Content is returned as supplied for every format. CSS selectors
reject in the headless host. Content is omitted from `getTabs()` results.
`--ai-answer` enables AI even for an empty answer; each answer emits one data chunk.
These flags also set synchronous `environment.canAccess` availability; bare
`--grant` does not enable these APIs. Extension-provided AI model selectors are
deferred and reject with an explicit error.
