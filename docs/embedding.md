# Embedding Blast

Blast is an engine, not a launcher. It runs an unmodified Raycast extension
command and gives an embedder a serializable UI plus requests for granted
capabilities. The embedder owns windows, pixels, input devices and policy.

A **session** is one launched command. A **scene** is the runtime's serializable
React tree. A **view** is the optional `client-core` model derived from scenes;
it includes ranking, selection, actions, shortcuts, pagination and feedback.
**Input** is semantic (`search`, movement, activation, back). A **capability** is
an OS or service operation, named in the catalog and either answered by Blast
(storage, OAuth, provider AI) or forwarded to the embedder.

## Views over stdio

Start the server (`@blastlauncher/serve@next`, bin `blast-serve`) and exchange
newline-delimited JSON. Stdout carries protocol output only.

```text
← {"type":"hello","protocol":1,"capabilities":["clipboard.copy"]}
→ {"type":"welcome","protocol":1,"engine":{"version":"0.0.0-dev"},"catalog":{...}}
← {"type":"request","id":"1","method":"extension.open","params":{"dir":"./myext"}}
→ {"type":"response","id":"1","ok":true,"result":{"extension":"1"}}
← {"type":"request","id":"2","method":"extension.launch","params":{"extension":"1","command":"index","views":{"platform":"macOS"}}}
→ {"type":"event","event":"session.view","session":"2","view":{...}}
← {"type":"request","id":"3","method":"session.input","params":{"session":"2","input":{"type":"search","text":"apple"}}}
→ {"type":"event","event":"session.view","session":"2","view":{...}}
```

To get views for every launch (servers newer than `3.0.0-alpha.1`), send them
once in the hello:
`"views":{"platform":"macOS","appearance":"dark"}` (a launch's own `views`
wins; `"views":false` or omitting it keeps scenes only). Icons in rows, grid
cells, menu rows and the empty view carry `iconLabel` (text fallback) plus
optional `iconSource` (`builtin` name, `url`, absolute `file` path under the
extension's `assets/`, or `fileIcon`), `iconTint` and `iconMask`, already
resolved for the appearance. `blast serve` installs missing dependencies by
default (`--dependencies manual` to opt out).

The Go [reference embedder](../examples/go-embedder/) draws `search`, `rows`,
`selectedId`, `actions` and `feedback.toast`, then forwards input. Responses
may be out of order and events may precede their response. IDs are unique while
outstanding; opaque extension and session keys must be awaited. `engine.shutdown`
finishes pending work and exits 0. EOF does the same. Malformed lines recover at
the next newline; protocol mismatch exits 2. Lines are capped at 8 MiB.

Capability forwarding uses `capability.request {id,session,name,params}` and an
answering `capability.result` (`ok:true,value` or `ok:false,error`); progress
uses `capability.progress`, cancellation uses `capability.cancel`. Unregistered
or ungranted capabilities are denied. See the [schema](../packages/protocol/schema/embedder-v1.schema.json).

## Scenes without views

Omit `views` from `extension.launch` to receive the raw scene stream instead:

```text
→ {"type":"event","event":"session.scene","session":"2","scene":{...}}
→ {"type":"event","event":"session.log","session":"2","log":{...}}
→ {"type":"event","event":"session.exited","session":"2","code":0}
← {"type":"request","id":"4","method":"session.event","params":{"session":"2","node":"5","handler":"onAction","args":[]}}
```

Scenes are replayed to new listeners and contain no private capability values.
Use `session.event` to route a scene node event; use `session.input` only when
views are enabled.

## In-process JS/TS

The published package is `@blastlauncher/engine` (source workspace package:
`@blastlauncher/host`). It runs on Node 24, Bun or Electron:

```ts
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine({
  dataDir: "./data",
  handlers: {
    "clipboard.copy": (params) => myClipboard(params),
  },
});
const extension = engine.openExtension({ extensionDir: "./myext" });
const { session, close } = await extension.launch("index", {
  installDependencies: true,
});
session.scenes((scene) => draw(scene));
session.sendEvent(nodeId, "onAction", args);
await session.exited;
await close();
```

For Raycast client behaviour, pass each scene through
`createController({ platform: "macOS" })`, subscribe to its `ControllerView`,
and apply returned events and effects. `openExtension` also exposes
`manifest()`, dependency checks/installation and preferences. Missing launch
values and unresolved dependencies are typed errors; retry with the requested
values or `installDependencies: true`.

## Root search

Skip writing a picker: the engine serves Raycast-style root search over every
opened extension's commands as an ordinary list view (sections per extension,
subtitles, mode labels, icons, an "Open Command" action).

```text
← {"type":"request","id":"5","method":"root.open","params":{"views":{"platform":"macOS"}}}
→ {"type":"response","id":"5","ok":true,"result":{"root":"3"}}
→ {"type":"event","event":"root.view","root":"3","view":{...}}
← {"type":"request","id":"6","method":"root.input","params":{"root":"3","input":{"type":"primary"}}}
→ {"type":"event","event":"root.launched","root":"3","session":"4"}
→ {"type":"event","event":"session.view","session":"4","view":{...}}
```

`views` defaults to the hello's. `root.view` carries the list again after every
change, including extensions opened, closed or edited later. Inputs are the
usual semantic ones (`search`, `move`, `select`, `primary`, `openActions`,
`back`); others are ignored. A primary starts the command as a normal session:
draw its `session.view` events and send `session.input`; `back` at its root
closes it and the root resumes (`root.view`, search cleared) after
`session.exited`. A launch that cannot start (missing preferences) stays on the
root with a failure toast in `feedback.toast`. `root.close` releases the root.

In process, `engine.root({ views })` returns `{ view, subscribe, input, ready,
close }` over every extension opened on the engine; the view becomes the
running command's until its session ends:

```ts
const root = engine.root({ views: { platform: "macOS" } });
await root.ready(); // manifests of the extensions opened so far are read
root.subscribe((view) => draw(view));
root.input({ type: "primary" });
```

## Capability contract

`packages/protocol/src/capabilities.ts` is the catalog: each name declares its
scope, summary, JSON-schema-like `params` and `result`, and triggering API
symbols. Grant handlers receive `(params, context)`, may be async, can report
`context.progress(value)`, and should honor `context.signal`. Start from
`createNativeHandlers()` in `@blastlauncher/native` for optional clipboard,
open, file-manager and trash handlers; otherwise register only your own grants.

The protocol is version 1. Additive changes stay on version 1; breaking changes
use a new schema and negotiation version. `bun run protocol:check` verifies the
checked-in schema.
