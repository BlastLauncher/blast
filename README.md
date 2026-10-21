# Blast

Blast is an embeddable engine that runs unmodified Raycast extensions outside
Raycast. It builds an extension, runs each command in its own Node.js process,
and hands your app what to draw: scenes, a ready-made view model with Raycast's
client behaviour, and requests for anything that touches the OS. You bring the
UI; Blast brings the extensions.

Compatibility is measured against the latest `@raycast/api`, not claimed:

- **API coverage:** 1533/1534 current symbols (the remaining one needs the
  embedder's browser), 939/939 deprecated ([COVERAGE.md](./compat/COVERAGE.md)).
- **Real extensions:** 184/200 curated commands render headlessly
  ([SMOKE.md](./compat/SMOKE.md)); extensions with their own dependencies
  install and render 54/56 ([SMOKE-DEPS.md](./compat/SMOKE-DEPS.md)).

> **Status:** pre-release. Nothing is published to npm yet. The previous
> prototype is frozen under [`archive/`](./archive/README.md).

## Where it stands (October 2026)

- **Done:**
  - headless runtime and host (M1);
  - real-extension runs (M2);
  - API coverage (M3);
  - terminal client (M4);
  - the embeddable engine (M5):
    - in-process API and `blast serve`, with a schema;
    - `client-core` controller with views over the wire;
    - capability catalog and registry;
    - native handlers;
    - lean per-extension dependency installs (about 5 MB for a typical extension);
    - bundle time limits;
    - npm release build.
- **Engine size:** about 13 MiB installed without the optional shared libraries.
- **Backlog** (see [PLAN.md](./PLAN.md), "Later"):
  - rerun the older smokes with placeholder inputs;
  - macOS window management without `yabai`;
  - Go example on server-side views;
  - publishing to npm.

## Two ways to embed

**In process (JS/TS: Node 24, Bun, Electron).**

```ts
import { createEngine } from "@blastlauncher/host"; // published as @blastlauncher/engine
import { createController } from "@blastlauncher/client-core";

const engine = createEngine({ handlers: { "clipboard.copy": (p) => myClipboard(p) } });
const extension = engine.openExtension({ extensionDir: "./my-extension" });
await extension.dependencies.install();
const { session } = await extension.launch("index");

const controller = createController({ platform: "macOS" });
session.scenes((scene) => apply(controller.scene(scene)));
controller.subscribe((view) => draw(view)); // rows, actions, search, toasts…
// apply(): send result.events to session.sendEvent, run result.effects
```

**Out of process (any language).** Spawn `blast serve` and speak versioned
NDJSON over stdio: open extensions, launch commands, receive scenes or view
models, send input, answer capability requests. See the
[JSON Schema](./packages/protocol/schema/embedder-v1.schema.json) and the
[Go example](./examples/go-embedder/).

Full guide: [docs/embedding.md](./docs/embedding.md).

## Packages

| Package       | What it is                                                               |
| ------------- | ------------------------------------------------------------------------ |
| `host`        | The engine: bundling, dependency installs, sessions, capability registry |
| `runtime`     | Runs one command: React reconciler + the `@raycast/api` implementation   |
| `protocol`    | Message types, capability catalog, embedder protocol and schema          |
| `client-core` | Framework-free Raycast client behaviour and the UI controller            |
| `serve`       | `blast serve`, the engine over stdio                                     |
| `native`      | Optional OS handlers for macOS, Windows and Linux (clipboard, open, …)   |
| `shared-deps` | Optional fallback copies of common extension libraries                   |
| `cli`         | `blast run`, a headless debug client                                     |
| `tui`         | A terminal reference client (OpenTUI, Bun)                               |

The engine core is platform-free: OS actions are capabilities your app
answers, or that you hand to `@blastlauncher/native`
([decision 0010](./docs/decisions/0010-pluggable-native-capabilities.md)).

## Try it

Requires Bun and Node.js 24.

```bash
bun install --frozen-lockfile
bun run blast run fixtures/extensions/hello-list index   # headless scene dump
bun run tui path/to/extension                            # terminal client
bun run blast:serve                                      # engine over stdio
```

## Development

```bash
bun run verify          # the only gate: format, lint, types, compat, protocol, workflow, tests
bun run release:build   # npm tarballs into .cache/release (not published)
```

- [Architecture](./docs/architecture.md) · [Capabilities](./docs/capabilities.md) ·
  [CLI](./docs/cli.md) · [TUI](./docs/tui.md) · [Decisions](./docs/decisions/)
- [Plan, milestones and backlog](./PLAN.md)
- [Contributor and agent workflow](./AGENTS.md)

## History

Blast v1 was an Electron launcher that ran Raycast extensions, published as
the `@blastlauncher/cli`, `runtime`, `api`, `renderer` and `utils` npm
packages (1.x). Its last app release is
[v0.0.14](https://github.com/BlastLauncher/blast/releases/tag/v0.0.14)
(August 2023), and its final source is
[`f713dd6` on `main`](https://github.com/BlastLauncher/blast/tree/f713dd6).
This v3 rewrite lives on `v3/restart`.

## License

MIT
