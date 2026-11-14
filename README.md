# Blast

Raycast extensions in any app. Blast is an embeddable engine: it runs the
launcher flow for you (command search, preference and argument prompts,
dependency installs, each command's UI) and hands your app views to draw and
capability requests to answer. You draw the pixels; Blast brings the extension.

**Try it in a browser** — no install: [blast.yukai.dev/demo](https://blast.yukai.dev/demo/).

**Embed in JS/TS** with the in-process engine
(`npm install @blastlauncher/engine@next`):

```js
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine({ handlers: { "clipboard.copy": (params) => copy(params) } });
engine.openExtension({ extensionDir: "./my-extension" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => draw(view)); // the command list, prompts, then the command
root.input({ type: "search", text: "ap" });
```

**Embed in any language** by spawning `blast serve`
(`npx -p @blastlauncher/serve@next blast-serve`) and speaking versioned NDJSON; the [Go](./examples/go-embedder/) and
[Python](./examples/python-embedder/) examples are standard-library clients:

```text
hello (with views) → welcome
extension.open, root.open → root.view: draw it; root.input → forward input
root.launched → session.view: draw it; session.input until session.exited
capability.request → answer capability.result
```

**Embed in a web page** with `@blastlauncher/web@next`: one `mount()` call runs
an extension in a sandbox on a second origin you host.

The [quickstart](./docs/quickstart.md) runs each path. The [embedding
guide](./docs/embedding.md) has the complete API and transcript.

## What the engine does for you

- Lists every opened extension's commands as a Raycast-style root view.
- Asks for missing preferences and arguments, and installs declared dependencies.
- Runs each command in its own Node.js process, brokering every privileged call.
- Implements Raycast client semantics, including storage and OAuth.

## What you do

- Draw views (list, grid, form, detail, actions, toasts) in your UI.
- Forward semantic input: search text, movement, primary action, back.
- Answer only the OS capabilities you choose to grant.

## Receipts and status

Compatibility is measured against the latest `@raycast/api`, not claimed:
[API coverage](./compat/COVERAGE.md) is 1537/1538 current symbols and the
[sandboxed sweep](./compat/SWEEP.md) renders 91.4% of 5,759 corpus commands.
The curated [smoke](./compat/SMOKE.md) renders 237/253 commands; dependency
smoke renders 51/52 ([details](./compat/SMOKE-DEPS.md)).

> **Alpha:** `3.0.0-alpha.2` is published on npm under `next`
> (`npm install @blastlauncher/<package>@next`); `latest` still points at
> Blast v1. Reference clients: the browser demo, the TUI, the Go and Python
> embedders, the AppKit and web launchers.

## Packages

| Package                          | Role                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `host` (`@blastlauncher/engine`) | Engine, bundling, sessions, dependencies, capabilities |
| `runtime`                        | React reconciler and `@raycast/api` implementation     |
| `protocol`                       | Message types, capability catalog and schema           |
| `client-core`                    | Framework-free views, ranking, selection and input     |
| `serve`                          | `blast serve` over stdio                               |
| `web`                            | Browser runtime for any web page, via `mount()`        |
| `native`                         | Optional macOS, Windows and Linux handlers             |
| `cli`                            | `blast run`, a headless debug client                   |
| `tui`                            | OpenTUI terminal reference client (Bun)                |

## Development

Requires Bun and Node.js 24.

```bash
bun install --frozen-lockfile
bun run verify
bun run release:build   # the npm packages as tarballs, for local testing
```

See [architecture](./docs/architecture.md), [capabilities](./docs/capabilities.md),
[CLI](./docs/cli.md), [release](./docs/release.md), [PLAN.md](./PLAN.md) and
[AGENTS.md](./AGENTS.md).

## History

Blast v1 was an Electron launcher published as the `@blastlauncher/cli`,
`runtime`, `api`, `renderer` and `utils` packages (1.x); its last app release
was [v0.0.14](https://github.com/BlastLauncher/blast/releases/tag/v0.0.14).
V3 is a from-scratch rewrite and an ongoing personal experiment.

## License

MIT
