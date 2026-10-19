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
| `ai.decide`                             | `--ai-decide <file.json>`    | denied                                           |
| `ai.ask`                                | `--ai-answer <text>`         | denied                                           |
| `browser.tabs`, `browser.content`       | `--browser-tabs <file.json>` | denied                                           |
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
- `submit` — run the first `Action.SubmitForm`; successful submission clears its draft.
- `wait` — wait for the next scene; `expect <text>` — fail unless the latest
  scene tree contains the text; `quit` — shut down with exit code 0.

Form `storeValue` choices and root `enableDrafts` edits survive launches with the
same `--data-dir` in its separate `internal/` store. Password fields never persist.

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

## AI model providers

`blast models <extensionDir>` loads the manifest's `ai.modelProvider` entry and
prints a JSON array with model IDs, titles, capabilities and optional metadata.
`blast complete <extensionDir> <modelId> <prompt>` streams the selected model's
text to stdout and prints a JSON finish part when supplied by the provider.
Both run the named provider exports in a separate runtime process and shut it
down afterwards. They use the same dependency policy as `run`. For example:

```bash
bun run blast models fixtures/extensions/model-provider
bun run blast complete fixtures/extensions/model-provider full "Hello"
```

The fixture runs offline; real providers may require preferences or credentials
supplied through the host session API. During `blast run`, AI.ask with a model
`{ id }` uses the extension's own provider without a grant, streams text deltas,
and shuts the provider down with the command. AI.refreshModels re-reads its
model list (no-op without a provider). Named creativity levels map to temperature
0/0.5/1/1.5/2; numeric values clamp to [0, 2].

`--ai-decide <file.json>` supplies an object keyed by the submitted question IDs.
Answers must match their question types: `{ "type": "noul", "noul": 0.8 }`;
choice answers carry `choice`, `confidence`, and `probabilities`; score answers
carry `score`, `confidence`, `legend`, and `probabilities`. Probabilities must
cover the declared options/levels and sum to one. Invalid answers reject the
API call. Without this flag decisions are denied, even with `--grant ai.decide`.

```bash
bun run blast run fixtures/extensions/model-provider ask --ai-decide answers.json
```
