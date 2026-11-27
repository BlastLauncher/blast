# Embedding Blast

Blast runs unmodified Raycast extension commands and hands your app views to
draw plus capability requests to answer. You own windows, pixels, input, and
policy; the engine owns the launcher flow (decision 0014): command search,
[launch prompts](launch-prompts.md), dependency installs, and command views.

A **view** is the `ControllerView` model (`kind`, `title`, `search`, `rows`,
`form`, `actions`, `feedback`, …) with ranking, selection, shortcuts, and
pagination applied. **Input** is semantic (`search`, `move`, `primary`,
`openActions`, `back`, …). A **session** is one launched command. A
**capability** is an operation in the catalog, answered by Blast or your app.

Install from npm (`latest` is `3.0.0-alpha.10`; `@next` follows `main`), e.g.
`npm install @blastlauncher/engine`. See [quickstart.md](quickstart.md) for
end-to-end setups.

## Over stdio, in any language

Start `blast serve` (`@blastlauncher/serve`, bin `blast-serve`, e.g.
`npx -p @blastlauncher/serve blast-serve`) and exchange NDJSON on stdin/stdout
(protocol 2; stdout is protocol-only). Ask for views in `hello`, open
extensions, and open the [root view](root-view.md):

```text
← {"type":"hello","protocol":2,"capabilities":["clipboard.copy"],"views":{"platform":"macOS"}}
→ {"type":"welcome","protocol":2,"engine":{"version":"…"},"catalog":{…}}
← {"type":"request","id":"1","method":"extension.open","params":{"dir":"./myext"}}
→ {"type":"response","id":"1","ok":true,"result":{"extension":"2"}}
← {"type":"request","id":"2","method":"root.open","params":{}}
→ {"type":"event","event":"root.view","root":"1","revision":1,"view":{"kind":"list","title":"Commands",…}}
→ {"type":"response","id":"2","ok":true,"result":{"root":"1"}}
← {"type":"request","id":"3","method":"root.input","params":{"root":"1","input":{"type":"primary"}}}
→ {"type":"event","event":"root.launched","root":"1","session":"3"}
→ {"type":"event","event":"session.view","session":"3","revision":1,"view":{"kind":"list",…}}
← {"type":"request","id":"4","method":"session.input","params":{"session":"3","input":{"type":"search","text":"ap"}}}
→ {"type":"event","event":"session.view.patch","session":"3","revision":2,"baseRevision":1,"ops":[{"op":"set","path":["search","text"],"value":"ap"},…]}
← {"type":"request","id":"5","method":"session.input","params":{"session":"3","input":{"type":"back"}}}
→ {"type":"event","event":"session.exited","session":"3","code":0}
```

Per root and per session, serve sends one full `root.view` / `session.view`
(`revision: 1`), then `root.view.patch` / `session.view.patch` (`revision`,
`baseRevision`, `ops`: `set`, `delete`, `splice` over object-key paths).
No-op updates emit nothing. On a `baseRevision` mismatch, send `root.resync` or
`session.resync` and drop patches until the next full view (decision 0020).
`@blastlauncher/protocol` exports `diffView` and `applyViewPatch`.

Send input to the session from `root.launched` until `session.exited`, then
return to the root's last view. The [Go](../examples/go-embedder/) and
[Python](../examples/python-embedder/) examples implement this full flow with
only their standard libraries.

`hello.views` (`platform`: `macOS`, `Windows`, or `Linux`; optional
`appearance`: `light` or `dark`) sets defaults for `root.open` and launches;
omitting it or passing `false` leaves views off. Raw `session.scene` events are
off unless `hello` passes `"scenes":true`. Icons carry `iconLabel` plus optional
`iconSource` (`builtin`, `url`, `file`, `fileIcon`), `iconTint`, and
`iconMask`, resolved for `appearance`. `blast serve` installs missing
dependencies by default (`--dependencies manual` to opt out) and accepts
`--native`.

### Client rules

- Keep request ids unique while outstanding; responses and events interleave.
  Extension, root, and session keys are opaque.
- A rejected line returns `{"type":"error","error":{…}}` with no request id;
  fail all outstanding requests when one arrives.
- Include every required input field (e.g. `{"type":"search","text":""}`).
- `engine.shutdown` or EOF finishes pending work and exits 0; version mismatch
  exits 2. Lines cap at 8 MiB and malformed lines recover at the next newline.

Capability forwarding uses `capability.request {id,session,name,params}`,
`capability.result` (`ok:true,value` or `ok:false,error`), `capability.progress`,
and `capability.cancel`. Every message is in
[embedder-v2.schema.json](../packages/protocol/schema/embedder-v2.schema.json).

### Lower level: one command, or raw scenes

`extension.launch {extension, command}` runs one command directly (`prompts:
true` enables launch prompts; `views` overrides `hello.views`; `bundleTimeoutMs`
overrides bundle timeout). `extension.configure {extension, command}` opens a
preferences form. Pass `"scenes":true` in `hello` for raw `session.scene` and
`session.log` debugging events, and send `session.event` for scene handlers:

```text
→ {"type":"event","event":"session.scene","session":"3","scene":{…}}
→ {"type":"event","event":"session.log","session":"3","log":{…}}
← {"type":"request","id":"6","method":"session.event","params":{"session":"3","node":"5","handler":"onAction","args":[]}}
```

## In-process JS/TS

`@blastlauncher/engine` (workspace `@blastlauncher/host`) runs on Node 24, Bun,
or Electron:

```js
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine({ handlers: { "clipboard.copy": (params) => copy(params) } });
engine.openExtension({ extensionDir: "./my-extension" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => draw(view));
await root.ready(); // manifests of extensions opened so far are read
root.input({ type: "search", text: "ap" });
```

`engine.root` returns `{ view, subscribe, input, ready, close }`.
`startLaunchFlow` runs prompts for one command ([launch-prompts.md](launch-prompts.md)).
For manual control, `extension.launch(command)` returns `{ session, close }`;
feed `session.scenes` to `createController({ platform })` from
`@blastlauncher/client-core`. `openExtension` also exposes `manifest()`,
`watch()`, `dependencies`, and `preferences()`.

## Capability contract

`packages/protocol/src/capabilities.ts` defines every capability (`scope`,
`params`, `result`, triggering symbols). Grant handlers `(params, context)` may
be async, report `context.progress(value)`, and honor `context.signal`. Start
from `createNativeHandlers()` in `@blastlauncher/native` for optional desktop
handlers. `bun run protocol:check` verifies the checked-in protocol schema.

## In a web page

`@blastlauncher/web` runs extensions in a cross-origin sandbox via `mount()`;
see [its README](../packages/web/README.md). Pass `fetchProxy` (or
`fetch-proxy` on `<blast-extension>`) to route sandbox HTTP requests through an
HTTPS proxy (HTTP loopback for tests; proxied requests omit browser credentials).
Deploy your own from `packages/cors-proxy`.

## Network proxy

The live demo forwards extension requests through our Cloudflare proxy. The
Worker does not log or store requests or responses. The operator can see request
contents; destination services receive them under their own policies. Do not
enter secret keys, tokens, or private data.
[Worker source](https://github.com/blastlauncher/blast/tree/main/packages/cors-proxy).
