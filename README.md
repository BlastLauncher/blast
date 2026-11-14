# Blast

Raycast extensions in any app. Blast is an embeddable engine: it builds and
runs an extension command, renders its Raycast client behaviour into scenes or
view models, and asks your app to answer the capabilities it grants. You draw
the pixels; Blast brings the extension.

**Try it in a browser** — no install: [blast.yukai.dev/demo](https://blast.yukai.dev/demo/).

**Embed in JS/TS** with the in-process engine and framework-free controller:

```ts
import { createEngine } from "@blastlauncher/engine";
import { createController } from "@blastlauncher/client-core";
const engine = createEngine({ handlers: { "clipboard.copy": (p) => copy(p) } });
const extension = engine.openExtension({ extensionDir: "./my-extension" });
const { session, close } = await extension.launch("index");
const controller = createController({ platform: "macOS" });
// Forward the controller's events to the command; run its timers.
const apply = ({ events, effects }) => {
  for (const e of events) session.sendEvent(e.node, e.handler, e.args);
  for (const f of effects)
    if (f.type === "schedule") setTimeout(() => apply(controller.tick(f.token)), f.ms);
    else close();
};
session.scenes((scene) => apply(controller.scene(scene)));
controller.subscribe((view) => draw(view)); // input: apply(controller.input(…))
```

**Embed in any language** by spawning `blast serve` from
`@blastlauncher/serve@next` (bin `blast-serve`) and speaking versioned NDJSON:

```text
hello → welcome
extension.open → extension.launch (with views: { platform: "macOS" })
session.view → draw it; session.input → forward semantic input
capability.request → answer capability.result
```

The [quickstart](./docs/quickstart.md) runs each path. The [embedding
reference](./docs/embedding.md) has the complete API and transcript.

## What the engine does for you

- Builds extensions and installs their declared dependencies.
- Runs each command in its own Node.js process, brokering every privileged call.
- Implements Raycast client semantics, including storage and OAuth.

## What you do

- Draw scenes or controller views in your UI.
- Answer only the OS capabilities you choose to grant.

## Receipts and status

Compatibility is measured against the latest `@raycast/api`, not claimed:
[API coverage](./compat/COVERAGE.md) is 1537/1538 current symbols and the
[sandboxed sweep](./compat/SWEEP.md) renders 91.4% of 5,759 corpus commands.
The curated [smoke](./compat/SMOKE.md) renders 237/253 commands; dependency
smoke renders 51/52 ([details](./compat/SMOKE-DEPS.md)).

> **Alpha:** `3.0.0-alpha.1` is published on npm under `next`; `latest` still
> points at Blast v1. The browser demo, Go embedder and AppKit example are
> current reference clients. More engine-owned flows are planned in M9.

## Packages

| Package                          | Role                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `host` (`@blastlauncher/engine`) | Engine, bundling, sessions, dependencies, capabilities |
| `runtime`                        | React reconciler and `@raycast/api` implementation     |
| `protocol`                       | Message types, capability catalog and schema           |
| `client-core`                    | Framework-free views, ranking, selection and input     |
| `serve`                          | `blast serve` over stdio                               |
| `native`                         | Optional macOS, Windows and Linux handlers             |
| `cli`                            | `blast run`, a headless debug client                   |
| `tui`                            | OpenTUI terminal reference client (Bun)                |

## Development

Requires Bun and Node.js 24.

```bash
bun install --frozen-lockfile
bun run verify
bun run release:build
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
