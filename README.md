# Blast

Blast is an embeddable engine that runs unmodified Raycast extensions outside
Raycast. It builds an extension, runs each command in its own Node.js process,
and hands your app what to draw: scenes, a ready-made view model with Raycast's
client behaviour, and requests for anything that touches the OS. You bring the
UI; Blast brings the extensions.

Compatibility is measured against the latest `@raycast/api`, not claimed:

- **API coverage:** `@raycast/api` 2.10.1, 1537/1538 current symbols (the
  remaining one needs the embedder's browser), 942/942 deprecated
  ([COVERAGE.md](./compat/COVERAGE.md)).
- **Real extensions:** across all 1,939 corpus extensions Blast's shared
  libraries cover, 91.4% of 5,759 commands render in a sandboxed, offline sweep
  ([SWEEP.md](./compat/SWEEP.md)); 237/253 curated commands render
  ([SMOKE.md](./compat/SMOKE.md)); extensions with their own dependencies
  install and render 51/52 ([SMOKE-DEPS.md](./compat/SMOKE-DEPS.md)).

> **Status:** alpha. `3.0.0-alpha.0` is on npm under the `next` tag
> ([release](https://github.com/BlastLauncher/blast/releases/tag/v3.0.0-alpha.0));
> `latest` still points at Blast v1 for `cli` and `runtime`. The previous
> prototype is kept at tag
> [`archive/v2-prototype-2026-10-18`](https://github.com/BlastLauncher/blast/tree/archive/v2-prototype-2026-10-18).

```bash
npm install @blastlauncher/engine@next @blastlauncher/client-core@next
npx @blastlauncher/cli@next run ./my-extension index
```

## Where it stands (November 2026)

- **Done:**
  - headless runtime and host (M1);
  - real-extension runs (M2);
  - API coverage (M3);
  - terminal client (M4);
  - the embeddable engine (M5): in-process API and `blast serve` with a
    schema, `client-core` views over the wire, capability registry, native
    handlers, lean per-extension dependency installs, npm release build;
  - evidence at scale (M6): latest-API tracking, a sandboxed corpus sweep with
    primary-action probes, Suspense and `use()`, dependencies as part of launch
    ([decision 0012](./docs/decisions/0012-launch-dependency-policy.md)), the
    Go example on views, TUI polish, and pre-releases via npm trusted
    publishing ([docs/release.md](./docs/release.md)).
- **Engine size:** about 13 MiB installed without the optional shared libraries.
- **Next:** real embedder examples. Backlog in [PLAN.md](./PLAN.md), "Later".

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
bun run release:build   # npm tarballs into .cache/release (publishing: docs/release.md)
```

- [Architecture](./docs/architecture.md) · [Capabilities](./docs/capabilities.md) ·
  [CLI](./docs/cli.md) · [TUI](./docs/tui.md) · [Decisions](./docs/decisions/)
- [Cut a v3 prerelease](./docs/release.md)
- [Plan, milestones and backlog](./PLAN.md)
- [Contributor and agent workflow](./AGENTS.md)

## History

Blast v1 was an Electron launcher that ran Raycast extensions, published as
the `@blastlauncher/cli`, `runtime`, `api`, `renderer` and `utils` npm
packages (1.x). Its last app release is
[v0.0.14](https://github.com/BlastLauncher/blast/releases/tag/v0.0.14)
(August 2023), and its final source is
[`f713dd6` on `main`](https://github.com/BlastLauncher/blast/tree/f713dd6).
v3 is a from-scratch rewrite and an ongoing personal experiment, not a product.

## License

MIT
