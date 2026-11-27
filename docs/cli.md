# `blast` debug CLI

Reference for the headless client in `packages/cli/src/cli.ts`.
`bun run blast --help` is authoritative; keep this file in sync with it.

```bash
bun run blast run <extensionDir> <command> [options]
```

Bundles a command, runs it in a runtime child process, and prints each scene as
a text tree (handler props as `[onAction]`). `# log` and `# capability` lines
interleave for logs and capabilities (token payloads in `oauth.tokens.*` are
redacted). `--json` emits protocol messages as NDJSON.

`<extensionDir>` may also be an Alfred workflow directory or `.alfredworkflow`
file (decision 0021): no bundle or dependencies; archives extract once into
`<dataDir>/workflows/`; commands are the workflow's keyword entries, and a
Keyword's `query` is an `--argument`.

## Extension dependencies

`blast deps <extensionDir> [--data-dir <dir>]` installs production dependencies
to `<dataDir>/deps/<encoded-name>/` using the lockfile, skipping install
scripts and reusing unchanged installs (warns if unpinned). Installed packages
precede `@blastlauncher/shared-deps`. `blast run` reports missing packages and
does not install them; run `blast deps` first.

For the embedder stdio server (`blast serve [--native]
[--dependencies manual|auto]`), see [embedding.md](embedding.md).

## Options

- `--fallback-text <text>` — `LaunchProps.fallbackText`.
- `--argument <name=value>` — manifest argument (repeatable; validates names
  and required fields).
- `--grant <capability>` — grant a capability and record/print its call (e.g.
  `clipboard.copy`, `clipboard.paste`, `clipboard.clear`, `finder.show`,
  `trash`, `window.setBounds`, `mcp.install`, `command.launch`).
- `--data-dir <dir>` — root for LocalStorage, OAuth, support, and internal
  storage (no grant needed).
- `--timeout <ms>` — abort the run after `<ms>` (exit 3); `--bundle-timeout
  <ms>` limits bundling (default 60000; 0 disables).

Headless defaults for client-owned capabilities:

| Capability                              | Flag                         | Default                                          |
| --------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `applications.list`                     | `--applications <file.json>` | empty list                                       |
| `applications.frontmost`                | `--frontmost <bundleId>`     | `{ name: "Headless", path: "" }`                 |
| `applications.default`, `window.active` | —                            | rejects: no default application or active window |
| `window.desktops`, `window.list`        | —                            | one empty desktop; no windows                    |
| `clipboard.read`                        | `--clipboard <text>`         | empty text (offset 0); empty at older offsets    |
| `selection.text`                        | `--selected-text <text>`     | rejects (no selection)                           |
| `selection.files`                       | `--selected-files <path>`    | empty list (repeatable)                          |
| `ai.decide`                             | `--ai-decide <file.json>`    | denied                                           |
| `ai.ask`                                | `--ai-answer <text>`         | denied                                           |
| `browser.tabs`, `browser.content`       | `--browser-tabs <file.json>` | denied                                           |
| `oauth.authorize`                       | `--oauth-code <code>`        | denied                                           |
| `preferences.open`, `command.metadata`  | —                            | answered and printed                             |

Exit codes: `0` success, `1` script or `expect` failure, `2` usage error, `3`
crash, bundle failure (`MISSING_DEPENDENCY`), or protocol error.

## Browser and AI flags

- `--browser-bridge [port]` — connect to
  [raycast-context-bridge](https://github.com/Yukaii/raycast-context-bridge)
  (Chrome default `7265`, Firefox `8787`, `0` picks a free port). Binds
  `127.0.0.1` and accepts only browser-extension Origins (`chrome-extension://`,
  `moz-extension://`, `safari-web-extension://`). View commands that fetch after
  first render need `--script` (e.g. `wait`) so `blast run` does not exit early.
  Conflicts with `--browser-tabs`.
- `--browser-tabs <file.json>` — supply tabs (`id`, `url`, `active`, optional
  `title`, `favicon`, `content`). Content defaults to the first active tab or
  `tabId` and returns as supplied; CSS selectors reject in the headless host.
- `--ai-answer <text>` — enables `AI` (even for `""`) and returns one chunk.
- `--ai-decide <file.json>` — object keyed by question ID:
  `{ "type": "noul", "noul": 0.8 }`, `choice` (`choice`, `confidence`,
  `probabilities`), or `score` (`score`, `confidence`, `legend`,
  `probabilities`), with probabilities covering all options and summing to 1.
  Without it, `ai.decide` is denied even with `--grant`.

Only `--ai-answer`, `--browser-tabs`, and `--browser-bridge` set
`environment.canAccess`; `--ai-decide` and bare `--grant` do not.

## Scripts

`--script <file|->` drives a run one command per line (`#` starts a comment):

- `action <title>` / `submenu <title>` — dispatch an action or submenu `onOpen`.
- `back`, `confirm`, `dismiss` — navigation pop, alert confirm/dismiss.
- `search <text>`, `dropdown <value>` — List/Grid search or dropdown `onChange`.
- `more` — pagination `onLoadMore` (fails unless `hasMore`).
- `field <id> <value>`, `submit` — edit Form fields (`true`/`false` checkboxes,
  ISO dates, comma-separated FilePicker/TagPicker, omit value to clear) and run
  the first `Action.SubmitForm`.
- `wait`, `expect <text>`, `quit` — wait for next scene, assert text in tree,
  exit `0`.

`storeValue` and `enableDrafts` persist across runs with the same `--data-dir`
(passwords never persist).

## AI model providers

`blast models <extensionDir>` prints a JSON array of `ai.modelProvider`
models; `blast complete <extensionDir> <modelId> <prompt>` streams text and
prints any finish part:

```bash
bun run blast models fixtures/extensions/model-provider
bun run blast complete fixtures/extensions/model-provider full "Hello"
```

During `blast run`, `AI.ask` with `{ id }` uses the extension's own provider
without a grant (named creativity levels map to `0/0.5/1/1.5/2`; numbers clamp
to `[0, 2]`). The interactive client is in [tui.md](tui.md).
