# Blast

Raycast extensions and Alfred workflows in any app. Blast is an embeddable
engine that runs the launcher flow (command search, preference and argument
prompts, dependency installs, and each command's UI) and hands your app views
to draw and capability requests to answer. You draw the pixels; Blast runs the
extension or workflow.

**Try it in a browser** (no install):
[blast.yukai.dev/demo](https://blast.yukai.dev/demo/).

**Embed in JS/TS** (`npm install @blastlauncher/engine`):

```js
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine({ handlers: { "clipboard.copy": (params) => copy(params) } });
engine.openExtension({ extensionDir: "./my-extension" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => draw(view)); // command list, prompts, then the command
root.input({ type: "search", text: "ap" });
```

**Embed in any language** via `blast serve` (`npx -p @blastlauncher/serve
blast-serve`) over version 2 NDJSON. See the [Go](./examples/go-embedder/) and
[Python](./examples/python-embedder/) standard-library clients:

```text
hello (with views) → welcome
extension.open, root.open → root.view then root.view.patch; root.input → input
root.launched → session.view then session.view.patch until session.exited
capability.request → answer capability.result
```

**Embed in a web page** with `@blastlauncher/web`: one `mount()` call runs an
extension in a sandbox on a second origin you host.

**Use it in tmux** with [tmux-blast](https://github.com/BlastLauncher/tmux-blast):
<kbd>Ctrl</kbd>+<kbd>Space</kbd> opens a Raycast-style palette in a popup with
pane, window, and session commands plus your Raycast extensions. With
[TPM](https://github.com/tmux-plugins/tpm), add to `~/.tmux.conf` and press
<kbd>prefix</kbd> <kbd>I</kbd>:

```tmux
set -g @plugin 'BlastLauncher/tmux-blast'
```

Needs tmux 3.2+ and Bun (`@blastlauncher/tui@next`). See
[tmux palette](./docs/tui.md#tmux-palette) for commands and options.

See the [quickstart](./docs/quickstart.md) and
[embedding guide](./docs/embedding.md).

## What Blast handles

- Runs unmodified Raycast extensions and Alfred workflows (unpacked folders or
  `.alfredworkflow` archives) on the same views and brokered capabilities; see
  [Alfred workflows](./docs/alfred.md).
- Lists every opened extension's commands as a Raycast-style root view.
- Prompts for missing preferences and arguments, and installs dependencies.
- Runs each command in its own Node.js process, brokering privileged calls.
- Implements Raycast client semantics, including storage and OAuth.

## What your app handles

- Draw views (`list`, `grid`, `form`, `detail`, `actions`, `toasts`, `alert`).
- Forward semantic input (`search`, `move`, `primary`, `openActions`, `back`).
- Answer only the OS capabilities you choose to grant.

## Receipts and status

Compatibility is measured against the latest `@raycast/api`:
[API coverage](./compat/COVERAGE.md) is 1546/1546 current symbols (`2.14.0`),
the [sandboxed sweep](./compat/SWEEP.md) renders 91.4% of 5,759 commands,
[curated smoke](./compat/SMOKE.md) renders 237/253, and
[dependency smoke](./compat/SMOKE-DEPS.md) renders 51/52.

[Alfred workflows](./docs/alfred.md) are measured with `bun run alfred:analyze`
against 242 real workflows: 39 object types and 35 core Automation Tasks are
supported, 242/242 parse with valid manifests, 223/242 expose runnable entries,
177/242 are fully supported, and 97.7% of execution objects (3,959/4,051) are
covered. Remaining gaps are tracked in
[#139](https://github.com/BlastLauncher/blast/issues/139).

> **Alpha:** `3.0.0-alpha.10` is `latest` on npm
> (`npm install @blastlauncher/<package>`); `@next` receives canaries from `main`
> merges that touch packages or release inputs. Reference clients: browser
> demo, TUI, Go and Python embedders, AppKit launcher, and web launcher.

## Packages

| Package                          | Role                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `host` (`@blastlauncher/engine`) | Engine, bundling, sessions, dependencies, capabilities |
| `runtime`                        | React reconciler and `@raycast/api` implementation     |
| `alfred`                         | Alfred workflow loader, object graph, and runner       |
| `protocol`                       | Message types, capability catalog, and schema          |
| `client-core`                    | Framework-free views, ranking, selection, and input    |
| `serve`                          | `blast serve` over stdio                               |
| `web`                            | Browser runtime for any web page via `mount()`         |
| `native`                         | Optional macOS, Windows, and Linux handlers            |
| `cli`                            | `blast run`, a headless debug client                   |
| `tui`                            | OpenTUI terminal client and tmux palette (Bun)         |

## Development

Requires Bun and Node.js 24.

```bash
bun install --frozen-lockfile
bun run verify
bun run release:build   # build npm packages as tarballs for local testing
```

See [architecture](./docs/architecture.md),
[capabilities](./docs/capabilities.md), [CLI](./docs/cli.md),
[release](./docs/release.md), [PLAN.md](./PLAN.md), and [AGENTS.md](./AGENTS.md).

## History

Blast v1 was an Electron launcher (`@blastlauncher/cli`, `runtime`, `api`,
`renderer`, `utils` 1.x; last release
[v0.0.14](https://github.com/BlastLauncher/blast/releases/tag/v0.0.14)).
V3 is a from-scratch rewrite and an ongoing personal experiment.

## License

MIT
