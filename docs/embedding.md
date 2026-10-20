# Embedding Blast

Blast is an engine, not a launcher (decision 0009): it runs unmodified Raycast
extensions and hands the embedder scenes, events, capability requests and
Raycast client semantics, so the embedder only draws. It is not a UI, does not
own windows, hotkeys, themes or a picker, and does not ship a launcher UI.

Two surfaces, one contract: an in-process JS API and `blast serve` over stdio
for other languages (decision 0011). Both expose the same operations with the
same message shapes; only transport differs. The types and validators live in
`packages/protocol`, the engine in `@blastlauncher/host`.

## Installing

`bun run release:build [--version 0.0.0-dev]` emits eight npm tarballs in `.cache/release/tarballs/`.
The engine alone installs with `npm install @blastlauncher/engine`; extension dependencies must be installed through `dependencies.install()` or `blast deps`.
Add `@blastlauncher/shared-deps` for the optional shared-library fallback; CLI and serve include it.
`dependencies.check().unresolved` lists declared packages unavailable from a matching install or that fallback.
Install all local tarballs together with `npm install .cache/release/tarballs/*.tgz`; published host imports use `@blastlauncher/engine`.
`bun run release:smoke` checks the emitted JS on Node 24 (API, `blast-serve`, `blast`), reports sizes and removes smoke `node_modules`.

## In-process (JS/TS)

```ts
import { createEngine } from "@blastlauncher/host";

const engine = createEngine({ dataDir?: string, handlers?, installer? });
const unregister = engine.register(handlers);              // optional, later wins
const extension = engine.openExtension({ extensionDir: "..." });
const manifest = await extension.manifest();               // validated commands et al
const { session, close } = await extension.launch("index", {
  argumentValues: { query: "a" },                          // optional
  launchContext,                                           // optional
  handlers: { "clipboard.copy": (params) => "ok" },        // grants, optional
});
session.scenes((scene) => draw(scene));                    // replays the latest scene
session.sendEvent(nodeId, handlerName, args);              // after an event
await session.exited;                                      // { code, signal, error? }
await extension.close();                                   // ends its sessions
```

`openExtension` also works standalone (`import { openExtension }`), with
`manifest()`, `watch(listener)` (live reload), `dependencies.check()` /
`install({ onLog })`, `preferences(command)` / `savePreferences(command, values)`
and `launch(command, options)` as on the engine handle. Missing launch values
reject with `MissingLaunchValuesError` (its `preferences` / `arguments` data is
exactly what a settings UI needs). Launch options return `{ session, close }`;
`session.scenes(callback)` subscribes and replays the latest scene, `latestScene`
and `logs` are direct reads, `exited` resolves on exit, and errors appear in
both logs and `exited.error`. Protocol version 1 (`packages/runtime`) is the
host↔runtime wire; embedders do not see it — only scenes (`scene` messages),
logs (`log` messages) and events.

To render: turn a scene into view models with
`@blastlauncher/client-core` — framework-free `sceneToView`, `matchesQuery`,
`selection`/event helpers (`event`, `handlerEvent`), `actionRows`,
`matchesShortcut`, `shortcutLabel`, grid, dropdown, pagination and form-field
behaviour driven by the same scene nodes — then handle pagination and `pop`
requests yourself. The TUI (`packages/tui`) is the reference embedder.

OS integration is opt-in: pass handlers yourself, or start from the optional
`createNativeHandlers()` of `@blastlauncher/native` (clipboard, open, file
manager, trash; more in decision 0010). `blast run`/`blast serve` merge the
same way — `blast serve --native` plus any embedder-declared grants.

## Out-of-process (`blast serve`)

Decisions 0009/0011, types in `@blastlauncher/protocol`:

```
$ node packages/serve/src/main.ts [--native]      # or `bun run blast:serve`
→ NDJSON on stdout, stdin lines in; stdout carries protocol output only.
```

Handshake, then a transcript:

```
← {"type":"hello","protocol":1,"capabilities":["clipboard.copy"]}
→ {"type":"welcome","protocol":1,"engine":{"version":"0.0.0"},
   "catalog":{ ...CAPABILITIES, one entry per capability... }}
← {"type":"request","id":"1","method":"extension.open","params":{"dir":"./myext"}}
→ {"type":"event","event":"manifest.changed","extension":"1","manifest":{...}}    (may precede)
→ {"type":"response","id":"1","ok":true,"result":{"extension":"1"}}
← {"type":"request","id":"2","method":"extension.launch",
   "params":{"extension":"1","command":"index"}}
→ {"type":"event","event":"session.scene","session":"2","scene":{...whole scene message...}}
→ {"type":"event","event":"session.log","session":"2","log":{...}}
→ {"type":"event","event":"session.exited","session":"2","code":0}
→ {"type":"response","id":"2","ok":true,"result":{"session":"2"}}
← {"type":"request","id":"3","method":"session.event",
   "params":{"session":"2","node":"5","handler":"onAction","args":[[...]]}}
```

Rules: unique `id`s while outstanding; responses may return out of order;
await `extension.open`/`extension.launch` before using their opaque keys;
void results are `null`; events can precede their response (including
manifest change and dependency-install logs). Malformed lines get
`{"type":"error","error":{"code":…,"message":…}}` and the stream recovers at the next
newline; a version mismatch ends the process with exit code 2. `engine.shutdown`
finishes pending operations, cancels forwarded work and exits 0; EOF does the
same. Line cap: 8 MiB.

Capability forwarding: every grant you declared comes back as
`capability.request {id,session,name,params}`; answer with
`capability.result` (`ok:true,value` / `ok:false,error`) and stream
`capability.progress` as needed. Runtime abort sends `capability.cancel`; late
answers are ignored. Storage, OAuth tokens and own-provider AI are answered by
the engine itself and cannot be shadowed by embedder handlers (decision 0010).

### Views

Opt into client-core view models; the server owns ranking, selection, actions,
shortcuts, pagination and timers. Draw `view` and forward semantic inputs:

```json
{"type":"request","id":"4","method":"extension.launch","params":{"extension":"1","command":"index","views":{"platform":"macOS"}}}
{"type":"event","event":"session.view","session":"3","view":{"kind":"list","rows":["..."],"...":"..."}}
{"type":"request","id":"5","method":"session.input","params":{"session":"3","input":{"type":"search","text":"apple"}}}
{"type":"request","id":"6","method":"session.input","params":{"session":"3","input":{"type":"primary"}}}
```

View objects follow `ControllerView` in `packages/client-core/src/controller.ts`
(abbreviated above). Events are deduplicated by JSON. Scenes still flow;
without `views`, use raw scenes/events. `back` at the root closes the session.

## Capability catalog

`packages/protocol/src/capabilities.ts` (`CAPABILITIES`) is the catalog: wire
name → `{ scope, summary, params, result, api }`. `params`/`result` are a
small JSON-Schema subset; `scope: "session"` capabilities are answered by the
engine, `scope: "grant"` ones go to the embedder (or native). The `welcome`
catalog carries this same structure.

To implement a capability, return a handler whose `params` (input) and value
(output) match its shapes: `(params, context) => value` — async or streaming
via `context.progress(value)`, cancellable via `context.signal`. Unregistered
grants are denied. The per-API mapping (`api`) tells you which `@raycast/api`
symbols trigger the request; `docs/capabilities.md` details the semantics.

## Schema and versioning

`bun run protocol:schema` (re)writes
`packages/protocol/schema/embedder-v1.schema.json` (draft 2020-12) from the
single source `packages/protocol/src/embedder-schema.ts`: `$defs` for every
embedder/server message, per-method `request.*`/`result.*` envelopes, every
event, scene/log shapes, and `capabilities.*` entries with catalog shapes.
`bun run protocol:check` fails when the file is stale; `bun run verify` runs
it as its `protocol` step — regenerate before committing instead of editing
the file: the checked-in copy must always match the source.

Version pinning follows decision 0009 point 5: the file and the `title` pin
protocol version 1; the integer `protocol` field on `hello`/`welcome` is the
negotiation pin (the `serve` process rejects other versions with exit 2), so
additive changes stay version 1 while breaking ones become `embedder-v2` at a
new `EMBEDDER_PROTOCOL_VERSION`.
