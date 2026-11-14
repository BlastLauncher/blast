# Embedding Blast

Blast is an engine, not a launcher. It runs unmodified Raycast extension
commands and gives an embedder views to draw plus requests for granted
capabilities. The embedder owns windows, pixels, input devices and policy;
the engine owns the launcher flow (decision 0014): command search, launch
prompts, dependency installs and each command's views.

A **view** is the serializable `ControllerView` model (`kind`, `title`,
`search`, `rows`, `form`, `actions`, `feedback`, …) with ranking, selection,
shortcuts and pagination already applied. **Input** is semantic (`search`,
`move`, `primary`, `openActions`, `back`, …). A **session** is one launched
command. A **capability** is an OS or service operation named in the catalog,
either answered by Blast (storage, OAuth, provider AI) or forwarded to you.

Install from npm `next` (`3.0.0-alpha.2`; `latest` is still Blast v1), e.g.
`npm install @blastlauncher/engine@next`; the [quickstart](quickstart.md) runs
each path end to end.

## Over stdio, in any language

Start `blast serve` (`@blastlauncher/serve`, bin `blast-serve`; e.g.
`npx -p @blastlauncher/serve@next blast-serve`) and exchange
newline-delimited JSON. Stdout carries protocol output only. Ask for views in
the hello, open extensions, then open the root and draw what it sends:

```text
← {"type":"hello","protocol":1,"capabilities":["clipboard.copy"],"views":{"platform":"macOS"}}
→ {"type":"welcome","protocol":1,"engine":{"version":"…"},"catalog":{…}}
← {"type":"request","id":"1","method":"extension.open","params":{"dir":"./myext"}}
→ {"type":"response","id":"1","ok":true,"result":{"extension":"2"}}
← {"type":"request","id":"2","method":"root.open","params":{}}
→ {"type":"event","event":"root.view","root":"1","view":{"kind":"list","title":"Commands",…}}
→ {"type":"response","id":"2","ok":true,"result":{"root":"1"}}
← {"type":"request","id":"3","method":"root.input","params":{"root":"1","input":{"type":"primary"}}}
→ {"type":"event","event":"root.launched","root":"1","session":"3"}
→ {"type":"event","event":"session.view","session":"3","view":{"kind":"list",…}}
← {"type":"request","id":"4","method":"session.input","params":{"session":"3","input":{"type":"search","text":"ap"}}}
→ {"type":"event","event":"session.view","session":"3","view":{…}}
← {"type":"request","id":"5","method":"session.input","params":{"session":"3","input":{"type":"back"}}}
→ {"type":"event","event":"session.exited","session":"3","code":0}
→ {"type":"event","event":"root.view","root":"1","view":{…}}
```

Send input to the session from `root.launched` until its `session.exited`,
then to the root again. The root lists every opened extension's commands;
launching runs [launch prompts](launch-prompts.md) for missing preferences,
arguments and dependencies as that session's views. Details:
[root-view.md](root-view.md). The [Go](../examples/go-embedder/) and
[Python](../examples/python-embedder/) examples are complete standard-library
clients of exactly this flow.

The hello's `views` (`platform`: `macOS`, `Windows` or `Linux`; optional
`appearance`: `light` or `dark`) apply to the root and every launch that does
not pass its own; `"views":false` or omitting it keeps raw scenes. Icons in
rows, grid cells, menu rows and the empty view carry `iconLabel` (text
fallback) plus optional `iconSource` (`builtin` name, `url`, absolute `file`
path under the extension's `assets/`, or `fileIcon`), `iconTint` and
`iconMask`, already resolved for the appearance. `blast serve` installs
missing dependencies by default (`--dependencies manual` to opt out).

### Client rules

- Request ids are yours and unique while outstanding. Responses may arrive out
  of order, and events may precede their response. Extension, root and session
  keys are opaque: use the ones the server returns.
- A line the server cannot accept gets a protocol `{"type":"error","error":{…}}`
  with no request id, so the request it carried never gets a response. Fail
  every outstanding request when one arrives (the Go and Python examples do).
- Send every field an input requires: a cleared search is
  `{"type":"search","text":""}`, never a missing `text` (that line is
  rejected). The view echoes the authoritative search text.
- `engine.shutdown` finishes pending work and exits 0; EOF does the same.
  Malformed lines recover at the next newline; a protocol version mismatch
  exits 2. Lines are capped at 8 MiB.

Capability forwarding uses `capability.request {id,session,name,params}` and
an answering `capability.result` (`ok:true,value` or `ok:false,error`);
progress uses `capability.progress`, cancellation `capability.cancel`.
Unregistered or ungranted capabilities are denied. Every message is in the
[schema](../packages/protocol/schema/embedder-v1.schema.json).

### Lower level: one command, or raw scenes

`extension.launch {extension, command}` runs one command without the root;
add `"prompts":true` to get the launch prompts instead of `missing_values` or
`missing_dependencies` errors, and `views` to override the hello's.
`extension.configure {extension, command}` shows a command's preferences form.
Without views, a session streams its React tree instead:

```text
→ {"type":"event","event":"session.scene","session":"3","scene":{…}}
→ {"type":"event","event":"session.log","session":"3","log":{…}}
← {"type":"request","id":"6","method":"session.event","params":{"session":"3","node":"5","handler":"onAction","args":[]}}
```

Scenes are replayed to new listeners and contain no private capability
values. Use `session.event` to route a scene node event; `session.input` only
when views are enabled.

## In-process JS/TS

The published package is `@blastlauncher/engine` (workspace package
`@blastlauncher/host`). It runs on Node 24, Bun or Electron, and offers the
same root:

```js
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine({ handlers: { "clipboard.copy": (params) => copy(params) } });
engine.openExtension({ extensionDir: "./my-extension" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => draw(view));
await root.ready(); // manifests of the extensions opened so far are read
root.input({ type: "search", text: "ap" });
```

`engine.root` returns `{ view, subscribe, input, ready, close }`; after a
`primary` the view is the launch prompt's, then the running command's, until
its session ends. `startLaunchFlow(extension, command, { views })` runs the
same prompts for one command ([launch-prompts.md](launch-prompts.md)).

For full control, `extension.launch(command)` returns `{ session, close }`;
feed `session.scenes` to `createController({ platform })` from
`@blastlauncher/client-core`, draw its views and apply the events and effects
it returns (`packages/host/src/root.ts` does exactly this). `openExtension`
also exposes `manifest()`, dependency checks and installs, and preferences.

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

## In a web page

`@blastlauncher/web` runs extensions in the browser runtime, inside a
cross-origin sandbox you host, with one `mount()` call; see its
[README](../packages/web/README.md).
